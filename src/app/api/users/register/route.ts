// app/api/users/register/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const full_name = String(body.full_name || '').trim();
    const user_id = String(body.user_id || body.username || '').trim();
    const password = String(body.password || '').trim();
    const role = String(body.role || 'worker').trim();
    const designations = String(body.designations || body.designation || 'Production Team').trim();

    // Optional initial shift & wage parameters during registration
    const pay_type = body.pay_type || 'monthly';
    const base_rate = Number(body.base_rate || 35000);
    const shift_start = body.shift_start || '09:00';
    const shift_end = body.shift_end || '21:00';

    if (!full_name || !user_id || !password) {
      return NextResponse.json(
        { error: 'Full name, Worker User ID, and Password are required.' },
        { status: 400 }
      );
    }

    // Insert using the active schema columns (user_id, designations) with fallback if legacy columns exist
    let insertId: number | null = null;
    try {
      const [result]: any = await db.execute(
        'INSERT INTO users (full_name, user_id, password, role, designations) VALUES (?, ?, ?, ?, ?)',
        [full_name, user_id, password, role, designations]
      );
      insertId = result.insertId;
    } catch (dbErr: any) {
      if (dbErr.code === 'ER_BAD_FIELD_ERROR') {
        const [fallback]: any = await db.execute(
          'INSERT INTO users (full_name, username, password, role, designation) VALUES (?, ?, ?, ?, ?)',
          [full_name, user_id, password, role, designations]
        );
        insertId = fallback.insertId;
      } else {
        throw dbErr;
      }
    }

    // Save initial wage profile
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS worker_wage_configs (
          worker_id VARCHAR(100) PRIMARY KEY,
          pay_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
          base_rate DECIMAL(12, 2) NOT NULL DEFAULT 35000.00,
          shift_start VARCHAR(10) NOT NULL DEFAULT '09:00',
          shift_end VARCHAR(10) NOT NULL DEFAULT '21:00',
          working_days_month INT NOT NULL DEFAULT 26,
          working_days_week INT NOT NULL DEFAULT 6,
          ot_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.50,
          grace_period_mins INT NOT NULL DEFAULT 15,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(
        `INSERT INTO worker_wage_configs (worker_id, pay_type, base_rate, shift_start, shift_end)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE pay_type = VALUES(pay_type), base_rate = VALUES(base_rate)`,
        [user_id, pay_type, base_rate, shift_start, shift_end]
      );
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Team member registered successfully',
      userId: insertId,
    });
  } catch (error: any) {
    console.error('Register error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Worker User ID already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Database error' }, { status: 500 });
  }
}