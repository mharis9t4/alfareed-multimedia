import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' }, 
        { status: 400 }
      );
    }

    // Match against user_id instead of username
    const [rows]: any = await db.execute(
      'SELECT id, user_id, role, full_name, designations FROM users WHERE user_id = ? AND password = ? LIMIT 1',
      [username.trim(), password]
    );

    if (rows && rows.length > 0) {
      const user = rows[0];
      return NextResponse.json({ 
        success: true, 
        user: {
          id: user.id,
          user_id: user.user_id,
          role: user.role,
          full_name: user.full_name,
          designation: user.designations || user.role
        }
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid identity or password' }, 
        { status: 401 }
      );
    }
  } catch (error: any) {
    console.error('Login Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Login failed' }, 
      { status: 500 }
    );
  }
}
