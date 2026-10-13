import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { cardId } = await req.json();

    const cleanCardId = String(cardId || '').trim();
    if (!cleanCardId) {
      return NextResponse.json(
        { error: 'Card ID is required' },
        { status: 400 }
      );
    }

    // 1. Identify employee by registered card ID
    const [userRows]: any = await db.execute(
      'SELECT id, user_id, full_name, role, hourly_rate FROM users WHERE card_id = ? LIMIT 1',
      [cleanCardId]
    );

    if (!userRows || userRows.length === 0) {
      return NextResponse.json(
        { 
          error: 'Unregistered card', 
          cardId: cleanCardId,
          message: 'This card is not assigned to any employee.' 
        },
        { status: 404 }
      );
    }

    const employee = userRows[0];
    const workerId = employee.user_id;

    // 2. Generate current Karachi date & time (PKT / UTC+5)
    const now = new Date();
    const currentDate = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Asia/Karachi' 
    }).format(now); // Format: YYYY-MM-DD

    const currentTime = new Intl.DateTimeFormat('en-GB', { 
      timeZone: 'Asia/Karachi', 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    }).format(now); // Format: HH:MM:SS

    // 3. Check for an active shift today without a clock_out
    const [attendanceRows]: any = await db.execute(
      'SELECT * FROM attendance WHERE worker_id = ? AND date = ? AND clock_out IS NULL ORDER BY id DESC LIMIT 1',
      [workerId, currentDate]
    );

    if (attendanceRows && attendanceRows.length > 0) {
      // --- ACTION: CLOCK OUT ---
      const activeRecord = attendanceRows[0];
      const clockInTime = activeRecord.clock_in;

      const inParts = clockInTime.split(':').map(Number);
      const outParts = currentTime.split(':').map(Number);

      const inSeconds = inParts[0] * 3600 + inParts[1] * 60 + (inParts[2] || 0);
      const outSeconds = outParts[0] * 3600 + outParts[1] * 60 + (outParts[2] || 0);
      
      const diffSeconds = Math.max(0, outSeconds - inSeconds);
      const totalHours = Number((diffSeconds / 3600).toFixed(2));
      
      const regularHours = Math.min(totalHours, 8);
      const overtimeHours = Number(Math.max(0, totalHours - regularHours).toFixed(2));

      await db.execute(
        `UPDATE attendance 
         SET clock_out = ?, regular_hours = ?, overtime_hours = ? 
         WHERE id = ?`,
        [currentTime, regularHours, overtimeHours, activeRecord.id]
      );

      return NextResponse.json({
        success: true,
        action: 'CLOCK_OUT',
        employee: {
          name: employee.full_name,
          worker_id: employee.user_id,
        },
        time: currentTime,
        date: currentDate,
        totalHours,
        regularHours,
        overtimeHours,
        message: `Goodbye, ${employee.full_name}! Shift completed.`
      });

    } else {
      // --- ACTION: CLOCK IN ---
      const [insertResult]: any = await db.execute(
        `INSERT INTO attendance (worker_id, date, clock_in, status, regular_hours, overtime_hours) 
         VALUES (?, ?, ?, 'Present', 0.00, 0.00)`,
        [workerId, currentDate, currentTime]
      );

      return NextResponse.json({
        success: true,
        action: 'CLOCK_IN',
        employee: {
          name: employee.full_name,
          worker_id: employee.user_id,
        },
        time: currentTime,
        date: currentDate,
        attendanceId: insertResult.insertId,
        message: `Welcome, ${employee.full_name}! Shift started.`
      });
    }

  } catch (error) {
    console.error('Scan Attendance API Error:', error);
    return NextResponse.json(
      { error: 'Failed to process card scan' },
      { status: 500 }
    );
  }
}