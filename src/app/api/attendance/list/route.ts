import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Select all available columns from attendance and join with users table
    const [rows]: any = await db.execute(`
      SELECT 
        a.*,
        u.full_name AS worker_name,
        u.designations
      FROM attendance a
      LEFT JOIN users u ON (a.worker_id = u.user_id OR CAST(a.worker_id AS CHAR) = CAST(u.id AS CHAR))
      ORDER BY a.id DESC
      LIMIT 150
    `);

    // Standardize field names to guarantee compatibility with the frontend dashboard
    const normalizedRows = (rows || []).map((row: any) => {
      const rawClockIn = row.clock_in || row.check_in || '—';
      const rawClockOut = row.clock_out || row.check_out || null;
      const regHours = parseFloat(String(row.regular_hours || row.reg_hrs || row.hours || 0));
      const otHours = parseFloat(String(row.overtime_hours || row.overtime_hrs || row.ot_hours || 0));

      let recordDate = row.date;
      if (!recordDate && row.created_at) {
        recordDate = new Date(row.created_at).toISOString().split('T')[0];
      } else if (!recordDate) {
        recordDate = new Date().toISOString().split('T')[0];
      }

      return {
        id: row.id,
        worker_id: String(row.worker_id || ''),
        worker_name: row.worker_name || `Worker #${row.worker_id}`,
        designations: row.designations || 'Team Member',
        date: String(recordDate),
        clock_in: String(rawClockIn),
        clock_out: rawClockOut ? String(rawClockOut) : null,
        status: row.status || (rawClockOut ? 'Completed' : 'Active'),
        regular_hours: isNaN(regHours) ? 0 : regHours,
        overtime_hours: isNaN(otHours) ? 0 : otHours,
        created_at: row.created_at || null
      };
    });

    return NextResponse.json(normalizedRows);
  } catch (error: any) {
    console.error('Fetch attendance error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch attendance logs' },
      { status: 500 }
    );
  }
}
