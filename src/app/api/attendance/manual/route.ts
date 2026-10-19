// app/api/attendance/manual/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  calculateCrossMidnightHours,
  getScheduledShiftHours,
  DEFAULT_WAGE_CONFIG,
} from '@/lib/payroll';

async function getWorkerScheduledHours(workerId: string): Promise<number> {
  try {
    const [rows]: any = await db.execute(
      'SELECT shift_start, shift_end FROM worker_wage_configs WHERE worker_id = ? LIMIT 1',
      [String(workerId).trim()]
    );
    if (rows && rows.length > 0) {
      return getScheduledShiftHours(rows[0].shift_start, rows[0].shift_end);
    }
  } catch {}
  return getScheduledShiftHours(DEFAULT_WAGE_CONFIG.shift_start, DEFAULT_WAGE_CONFIG.shift_end);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, record_id, worker_id, date, clock_in, clock_out, status } = body;

    // 1. Delete an erroneous attendance log
    if (action === 'DELETE_ENTRY') {
      if (!record_id) {
        return NextResponse.json({ error: 'record_id is required' }, { status: 400 });
      }
      await db.execute('DELETE FROM attendance WHERE id = ?', [record_id]);
      return NextResponse.json({ success: true, message: 'Attendance record deleted.' });
    }

    // 2. Admin Manual Sign Out for an Active Shift
    if (action === 'CLOCK_OUT') {
      if (!record_id && !worker_id) {
        return NextResponse.json({ error: 'record_id or worker_id is required' }, { status: 400 });
      }

      let targetRecordId = record_id;
      let targetClockIn = clock_in;
      let targetWorkerId = worker_id;

      if (!targetRecordId) {
        const [activeRows]: any = await db.execute(
          'SELECT id, worker_id, clock_in FROM attendance WHERE worker_id = ? AND clock_out IS NULL ORDER BY id DESC LIMIT 1',
          [worker_id]
        );
        if (!activeRows || activeRows.length === 0) {
          return NextResponse.json({ error: 'No active shift found for this worker' }, { status: 404 });
        }
        targetRecordId = activeRows[0].id;
        targetClockIn = activeRows[0].clock_in;
        targetWorkerId = activeRows[0].worker_id;
      }

      const outTime =
        clock_out ||
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Karachi',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date());

      const scheduledHours = await getWorkerScheduledHours(targetWorkerId);
      const totalHours = calculateCrossMidnightHours(targetClockIn, outTime);
      const regHours = Number(Math.min(scheduledHours, totalHours).toFixed(2));
      const otHours = Number(Math.max(0, totalHours - regHours).toFixed(2));

      await db.execute(
        `UPDATE attendance 
         SET clock_out = ?, regular_hours = ?, overtime_hours = ?, status = 'Completed' 
         WHERE id = ?`,
        [outTime, regHours, otHours, targetRecordId]
      );

      return NextResponse.json({
        success: true,
        message: 'Worker signed out successfully.',
        regular_hours: regHours,
        overtime_hours: otHours,
      });
    }

    // 3. Admin Manual Add or Adjust Timing
    if (action === 'SAVE_ENTRY') {
      if (!worker_id || !date || !clock_in) {
        return NextResponse.json(
          { error: 'Worker, date, and clock-in time are required.' },
          { status: 400 }
        );
      }

      const scheduledHours = await getWorkerScheduledHours(worker_id);
      let regHours = 0;
      let otHours = 0;

      if (clock_out && String(clock_out).trim() !== '') {
        const totalHours = calculateCrossMidnightHours(clock_in, clock_out);
        regHours = Number(Math.min(scheduledHours, totalHours).toFixed(2));
        otHours = Number(Math.max(0, totalHours - regHours).toFixed(2));
      }

      const cleanOut = clock_out && String(clock_out).trim() !== '' ? String(clock_out).trim() : null;
      const shiftStatus = status || (cleanOut ? 'Completed' : 'Active');

      if (record_id) {
        await db.execute(
          `UPDATE attendance 
           SET worker_id = ?, date = ?, clock_in = ?, clock_out = ?, regular_hours = ?, overtime_hours = ?, status = ?
           WHERE id = ?`,
          [String(worker_id).trim(), date, clock_in.trim(), cleanOut, regHours, otHours, shiftStatus, record_id]
        );
      } else {
        await db.execute(
          `INSERT INTO attendance (worker_id, date, clock_in, clock_out, regular_hours, overtime_hours, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [String(worker_id).trim(), date, clock_in.trim(), cleanOut, regHours, otHours, shiftStatus]
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Attendance record saved successfully.',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Manual attendance error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}