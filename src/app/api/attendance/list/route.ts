// app/api/attendance/list/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const [rows]: any = await db.execute(`
      SELECT 
        a.id,
        CAST(a.worker_id AS CHAR) AS worker_id,
        COALESCE(
          DATE_FORMAT(a.date, '%Y-%m-%d'), 
          DATE_FORMAT(a.created_at, '%Y-%m-%d')
        ) AS date,
        a.clock_in,
        a.clock_out,
        a.status,
        a.regular_hours,
        a.overtime_hours,
        a.created_at,
        u.full_name AS worker_name,
        u.designations
      FROM attendance a
      LEFT JOIN users u ON (
        CAST(a.worker_id AS CHAR) = CAST(u.user_id AS CHAR) 
        OR CAST(a.worker_id AS CHAR) = CAST(u.id AS CHAR)
      )
      ORDER BY a.date DESC, a.id DESC
      LIMIT 1000
    `);

    const normalizedRows = (rows || []).map((row: any) => {
      let dateStr = '';
      if (row.date) {
        const s = String(row.date);
        const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
        dateStr = match ? match[1] : s.split('T')[0].split(' ')[0].trim();
      } else if (row.created_at) {
        const s = String(row.created_at);
        const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
        dateStr = match ? match[1] : new Date(row.created_at).toISOString().split('T')[0];
      } else {
        dateStr = new Date().toISOString().split('T')[0];
      }

      return {
        id: row.id,
        worker_id: String(row.worker_id || '').trim(),
        worker_name: row.worker_name || `Worker #${row.worker_id}`,
        designations: row.designations || 'Production Staff',
        date: dateStr,
        clock_in: String(row.clock_in || '09:00:00'),
        clock_out: row.clock_out ? String(row.clock_out) : null,
        status: row.status || (row.clock_out ? 'Completed' : 'Active'),
        regular_hours: parseFloat(String(row.regular_hours || 0)),
        overtime_hours: parseFloat(String(row.overtime_hours || 0)),
        created_at: row.created_at || null,
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