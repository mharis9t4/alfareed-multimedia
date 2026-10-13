import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const [rows]: any = await db.execute(`
      SELECT 
        a.id,
        a.worker_id,
        u.full_name AS worker_name,
        u.designations,
        a.date,
        a.clock_in,
        a.clock_out,
        a.status,
        a.regular_hours,
        a.overtime_hours,
        a.created_at
      FROM attendance a
      LEFT JOIN users u ON a.worker_id = u.user_id
      ORDER BY a.id DESC
      LIMIT 100
    `);

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error('Fetch attendance error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch attendance logs' },
      { status: 500 }
    );
  }
}
