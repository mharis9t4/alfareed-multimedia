import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const mer = match[4] ? match[4].toUpperCase() : null;
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, record_id, worker_id, date, clock_in, clock_out, status } = body;

    // 1. Admin Manual Sign Out for an Active Shift
    if (action === 'CLOCK_OUT') {
      if (!record_id && !worker_id) {
        return NextResponse.json({ error: 'record_id or worker_id is required' }, { status: 400 });
      }

      let targetRecordId = record_id;
      let targetClockIn = clock_in;

      if (!targetRecordId) {
        const [activeRows]: any = await db.execute(
          'SELECT id, clock_in FROM attendance WHERE worker_id = ? AND clock_out IS NULL ORDER BY id DESC LIMIT 1',
          [worker_id]
        );
        if (!activeRows || activeRows.length === 0) {
          return NextResponse.json({ error: 'No active shift found for this worker' }, { status: 404 });
        }
        targetRecordId = activeRows[0].id;
        targetClockIn = activeRows[0].clock_in;
      }

      const outTime = clock_out || new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(new Date());

      const inM = parseTimeToMinutes(targetClockIn);
      const outM = parseTimeToMinutes(outTime);
      let regHours = 8;
      let otHours = 0;
      if (inM !== null && outM !== null && outM > inM) {
        const diff = (outM - inM) / 60;
        regHours = Math.min(10, Math.round(diff * 10) / 10);
        otHours = Math.max(0, Math.round((diff - regHours) * 10) / 10);
      }

      await db.execute(
        `UPDATE attendance 
         SET clock_out = ?, regular_hours = ?, overtime_hours = ?, status = 'Completed' 
         WHERE id = ?`,
        [outTime, regHours, otHours, targetRecordId]
      );

      return NextResponse.json({ success: true, message: 'Worker signed out successfully.' });
    }

    // 2. Admin Manual Add or Adjust Timing
    if (action === 'SAVE_ENTRY') {
      if (!worker_id || !date || !clock_in) {
        return NextResponse.json({ error: 'Worker, date, and clock-in time are required.' }, { status: 400 });
      }

      let regHours = 0;
      let otHours = 0;
      if (clock_out) {
        const inM = parseTimeToMinutes(clock_in);
        const outM = parseTimeToMinutes(clock_out);
        if (inM !== null && outM !== null && outM > inM) {
          const diff = (outM - inM) / 60;
          regHours = Math.min(10, Math.round(diff * 10) / 10);
          otHours = Math.max(0, Math.round((diff - regHours) * 10) / 10);
        }
      }

      const shiftStatus = status || (clock_out ? 'Completed' : 'Active');

      if (record_id) {
        // Update existing row
        await db.execute(
          `UPDATE attendance 
           SET worker_id = ?, date = ?, clock_in = ?, clock_out = ?, regular_hours = ?, overtime_hours = ?, status = ?
           WHERE id = ?`,
          [worker_id, date, clock_in, clock_out || null, regHours, otHours, shiftStatus, record_id]
        );
      } else {
        // Insert new row
        await db.execute(
          `INSERT INTO attendance (worker_id, date, clock_in, clock_out, regular_hours, overtime_hours, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [worker_id, date, clock_in, clock_out || null, regHours, otHours, shiftStatus]
        );
      }

      return NextResponse.json({ success: true, message: 'Attendance record saved successfully.' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Manual attendance error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
