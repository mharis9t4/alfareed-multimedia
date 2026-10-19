// app/api/attendance/scan/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  calculateCrossMidnightHours,
  getScheduledShiftHours,
  parseTimeToMinutes,
  DEFAULT_WAGE_CONFIG,
} from '@/lib/payroll';

export async function POST(req: Request) {
  try {
    const { cardId } = await req.json();
    const cleanCardId = String(cardId || '').trim();

    if (!cleanCardId) {
      return NextResponse.json({ error: 'Card ID is required' }, { status: 400 });
    }

    // 1. Identify employee by registered card ID
    const [userRows]: any = await db.execute(
      'SELECT id, user_id, full_name, role, designations FROM users WHERE card_id = ? LIMIT 1',
      [cleanCardId]
    );

    if (!userRows || userRows.length === 0) {
      return NextResponse.json(
        {
          error: 'Unregistered card',
          cardId: cleanCardId,
          message: 'This card is not assigned to any employee.',
        },
        { status: 404 }
      );
    }

    const employee = userRows[0];
    const workerId = String(employee.user_id).trim();

    // 2. Fetch worker's scheduled shift length from worker_wage_configs (fallback to 12h or default)
    let scheduledShiftHours = getScheduledShiftHours(
      DEFAULT_WAGE_CONFIG.shift_start,
      DEFAULT_WAGE_CONFIG.shift_end
    );
    try {
      const [cfgRows]: any = await db.execute(
        'SELECT shift_start, shift_end FROM worker_wage_configs WHERE worker_id = ? LIMIT 1',
        [workerId]
      );
      if (cfgRows && cfgRows.length > 0) {
        scheduledShiftHours = getScheduledShiftHours(cfgRows[0].shift_start, cfgRows[0].shift_end);
      }
    } catch {
      // Table may not exist on first scan; safe to ignore and use default
    }

    // 3. Generate current Karachi date & time (PKT / UTC+5) and Yesterday's Karachi date
    const now = new Date();
    const currentDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
    }).format(now); // YYYY-MM-DD

    const yesterdayDateObj = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
    }).format(yesterdayDateObj); // YYYY-MM-DD

    const currentTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now); // HH:MM:SS (24-hour)

    // 4. Look for an open shift from TODAY or YESTERDAY (fixes 9 AM -> 1:30 AM next day sign-out)
    const [openShifts]: any = await db.execute(
      `SELECT id, worker_id, DATE_FORMAT(date, '%Y-%m-%d') AS shift_date, clock_in 
       FROM attendance 
       WHERE worker_id = ? AND clock_out IS NULL AND date IN (?, ?)
       ORDER BY id DESC LIMIT 1`,
      [workerId, currentDate, yesterdayDate]
    );

    let activeRecord: any = null;

    if (openShifts && openShifts.length > 0) {
      const candidate = openShifts[0];
      const candDate = String(candidate.shift_date || '').slice(0, 10);

      if (candDate === currentDate) {
        activeRecord = candidate;
      } else if (candDate === yesterdayDate) {
        // Calculate total elapsed hours across midnight to ensure it's a valid overnight shift (<= 22 hours)
        const inMins = parseTimeToMinutes(candidate.clock_in) ?? 0;
        const outMins = parseTimeToMinutes(currentTime) ?? 0;
        const elapsedHours = (24 * 60 - inMins + outMins) / 60;

        if (elapsedHours > 0 && elapsedHours <= 22) {
          activeRecord = candidate;
        }
      }
    }

    if (activeRecord) {
      // --- ACTION: CLOCK OUT (Supports Same-Day & Overnight Cross-Midnight) ---
      const shiftDateStr = String(activeRecord.shift_date || currentDate).slice(0, 10);
      const isOvernight = shiftDateStr !== currentDate;

      let totalHours = 0;
      if (isOvernight) {
        const inMins = parseTimeToMinutes(activeRecord.clock_in) ?? 0;
        const outMins = parseTimeToMinutes(currentTime) ?? 0;
        totalHours = Number(Math.max(0, (24 * 60 - inMins + outMins) / 60).toFixed(2));
      } else {
        totalHours = calculateCrossMidnightHours(activeRecord.clock_in, currentTime);
      }

      const regularHours = Number(Math.min(totalHours, scheduledShiftHours).toFixed(2));
      const overtimeHours = Number(Math.max(0, totalHours - regularHours).toFixed(2));

      await db.execute(
        `UPDATE attendance 
         SET clock_out = ?, regular_hours = ?, overtime_hours = ?, status = 'Completed' 
         WHERE id = ?`,
        [currentTime, regularHours, overtimeHours, activeRecord.id]
      );

      return NextResponse.json({
        success: true,
        action: 'CLOCK_OUT',
        isOvernight,
        shiftDate: shiftDateStr,
        employee: {
          name: employee.full_name,
          worker_id: workerId,
          designation: employee.designations || employee.role,
        },
        time: currentTime,
        date: currentDate,
        totalHours,
        regularHours,
        overtimeHours,
        message: isOvernight
          ? `Overnight shift from ${shiftDateStr} closed! Total: ${totalHours} hrs.`
          : `Goodbye, ${employee.full_name}! Shift completed.`,
      });
    } else {
      // --- ACTION: CLOCK IN ---
      const [insertResult]: any = await db.execute(
        `INSERT INTO attendance (worker_id, date, clock_in, status, regular_hours, overtime_hours) 
         VALUES (?, ?, ?, 'Active', 0.00, 0.00)`,
        [workerId, currentDate, currentTime]
      );

      return NextResponse.json({
        success: true,
        action: 'CLOCK_IN',
        employee: {
          name: employee.full_name,
          worker_id: workerId,
          designation: employee.designations || employee.role,
        },
        time: currentTime,
        date: currentDate,
        attendanceId: insertResult.insertId,
        message: `Welcome, ${employee.full_name}! Shift started at ${currentTime}.`,
      });
    }
  } catch (error: any) {
    console.error('Scan Attendance API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process card scan' },
      { status: 500 }
    );
  }
}