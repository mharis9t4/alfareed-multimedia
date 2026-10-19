// app/api/users/wage-config/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

async function ensureWageTable() {
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
}

export async function GET() {
  try {
    await ensureWageTable();
    const [rows]: any = await db.execute('SELECT * FROM worker_wage_configs');
    return NextResponse.json(rows || []);
  } catch (error: any) {
    console.error('Fetch wage configs error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load wage configs' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureWageTable();
    const body = await req.json();
    const {
      worker_id,
      pay_type = 'monthly',
      base_rate = 35000,
      shift_start = '09:00',
      shift_end = '21:00',
      working_days_month = 26,
      working_days_week = 6,
      ot_multiplier = 1.5,
      grace_period_mins = 15,
    } = body;

    if (!worker_id) {
      return NextResponse.json({ error: 'worker_id is required' }, { status: 400 });
    }

    await db.execute(
      `INSERT INTO worker_wage_configs 
        (worker_id, pay_type, base_rate, shift_start, shift_end, working_days_month, working_days_week, ot_multiplier, grace_period_mins)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        pay_type = VALUES(pay_type),
        base_rate = VALUES(base_rate),
        shift_start = VALUES(shift_start),
        shift_end = VALUES(shift_end),
        working_days_month = VALUES(working_days_month),
        working_days_week = VALUES(working_days_week),
        ot_multiplier = VALUES(ot_multiplier),
        grace_period_mins = VALUES(grace_period_mins)`,
      [
        String(worker_id).trim(),
        pay_type,
        Number(base_rate),
        shift_start,
        shift_end,
        Number(working_days_month),
        Number(working_days_week),
        Number(ot_multiplier),
        Number(grace_period_mins),
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Worker shift & wage configuration saved to database.',
    });
  } catch (error: any) {
    console.error('Save wage config error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save wage config' }, { status: 500 });
  }
}