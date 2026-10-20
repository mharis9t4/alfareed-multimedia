// src/app/api/attendance/sunday-mode/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { record_id, sunday_mode, sunday_coverage_hours } = body;

    if (!record_id || !sunday_mode) {
      return NextResponse.json(
        { error: 'record_id and sunday_mode are required' },
        { status: 400 }
      );
    }

    try {
      await db.execute(
        `ALTER TABLE attendance ADD COLUMN sunday_mode VARCHAR(30) DEFAULT 'AUTO_SPLIT'`
      );
    } catch {}
    try {
      await db.execute(
        `ALTER TABLE attendance ADD COLUMN sunday_coverage_hours DECIMAL(6,2) DEFAULT 0.00`
      );
    } catch {}

    await db.execute(
      `UPDATE attendance 
       SET sunday_mode = ?, sunday_coverage_hours = ? 
       WHERE id = ?`,
      [String(sunday_mode), Number(sunday_coverage_hours || 0), Number(record_id)]
    );

    return NextResponse.json({
      success: true,
      message: 'Sunday allocation updated successfully.',
    });
  } catch (error: any) {
    console.error('Update Sunday mode error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update Sunday mode' },
      { status: 500 }
    );
  }
}