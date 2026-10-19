// app/api/users/list/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const [rows]: any = await db.execute(
      `SELECT id, user_id, full_name, role, designations, card_id, is_online 
       FROM users 
       WHERE role != 'customer' 
       ORDER BY id ASC`
    );
    return NextResponse.json(rows || []);
  } catch (error) {
    console.error('Fetch team list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team members' },
      { status: 500 }
    );
  }
}