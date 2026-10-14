import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS project_briefs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_name VARCHAR(255) NOT NULL,
        service_type VARCHAR(100) NOT NULL,
        deadline VARCHAR(100) NULL,
        description TEXT NOT NULL,
        phone VARCHAR(50) NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [rows]: any = await db.execute(
      'SELECT * FROM project_briefs ORDER BY id DESC LIMIT 50'
    );

    return NextResponse.json(rows);
  } catch (error: any) {
    console.error('Fetch project briefs error:', error);
    return NextResponse.json([], { status: 200 });
  }
}
