import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const client_name = body.client_name?.trim();
    const service_type = body.service_type?.trim() || 'General Printing';
    const deadline = body.deadline?.trim() || 'Standard';
    const phone = body.phone?.trim() || '';
    const description = body.description?.trim() || '';

    if (!client_name || !description) {
      return NextResponse.json(
        { error: 'Client entity name and project requirements are required.' },
        { status: 400 }
      );
    }

    // Ensure the table exists in the database
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

    let insertId: number | null = null;

    // Insert with phone; if table lacks the phone column, fallback by appending it to description
    try {
      const [result]: any = await db.execute(
        `INSERT INTO project_briefs (client_name, service_type, deadline, description, phone) 
         VALUES (?, ?, ?, ?, ?)`,
        [client_name, service_type, deadline, description, phone]
      );
      insertId = result.insertId;
    } catch (colErr: any) {
      if (colErr.code === 'ER_BAD_FIELD_ERROR' || colErr.message?.includes('phone')) {
        const enrichedDesc = phone ? `[Client Contact: ${phone}] ${description}` : description;
        const [fallbackResult]: any = await db.execute(
          `INSERT INTO project_briefs (client_name, service_type, deadline, description) 
           VALUES (?, ?, ?, ?)`,
          [client_name, service_type, deadline, enrichedDesc]
        );
        insertId = fallbackResult.insertId;
      } else {
        throw colErr;
      }
    }

    return NextResponse.json({
      success: true,
      id: insertId,
      message: 'Project brief submitted successfully.'
    });
  } catch (error: any) {
    console.error('Project Submission Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit project brief.' },
      { status: 500 }
    );
  }
}
