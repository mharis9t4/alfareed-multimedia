// src/app/api/admin/ot-payments/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

async function ensureOtPaymentsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS worker_ot_payments (
      worker_id VARCHAR(100) NOT NULL,
      period_key VARCHAR(50) NOT NULL DEFAULT 'CURRENT',
      paid_ot_hours DECIMAL(8,2) NOT NULL DEFAULT 0.00,
      paid_ot_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      notes VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (worker_id, period_key)
    )
  `);
}

export async function GET() {
  try {
    await ensureOtPaymentsTable();
    const [rows]: any = await db.execute('SELECT * FROM worker_ot_payments');
    return NextResponse.json(rows || []);
  } catch (error: any) {
    console.error('Fetch OT payments error:', error);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureOtPaymentsTable();
    const body = await req.json();
    const {
      worker_id,
      period_key = 'CURRENT',
      paid_ot_hours = 0,
      paid_ot_amount = 0,
      notes = '',
    } = body;

    if (!worker_id) {
      return NextResponse.json({ error: 'worker_id is required' }, { status: 400 });
    }

    await db.execute(
      `INSERT INTO worker_ot_payments (worker_id, period_key, paid_ot_hours, paid_ot_amount, notes)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         paid_ot_hours = VALUES(paid_ot_hours),
         paid_ot_amount = VALUES(paid_ot_amount),
         notes = VALUES(notes)`,
      [
        String(worker_id).trim(),
        String(period_key).trim(),
        Number(paid_ot_hours || 0),
        Number(paid_ot_amount || 0),
        String(notes || '').trim(),
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Overtime payment record saved.',
    });
  } catch (error: any) {
    console.error('Save OT payment error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save OT payment' },
      { status: 500 }
    );
  }
}