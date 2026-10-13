import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { userId, cardId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const cleanCardId = cardId ? String(cardId).trim() : null;

    // Check if this card is already assigned to another employee
    if (cleanCardId) {
      const [existing]: any = await db.execute(
        'SELECT id, full_name, user_id FROM users WHERE card_id = ? AND user_id != ? LIMIT 1',
        [cleanCardId, userId]
      );

      if (existing && existing.length > 0) {
        return NextResponse.json(
          { 
            error: `This card is already assigned to ${existing[0].full_name} (${existing[0].user_id})` 
          },
          { status: 409 }
        );
      }
    }

    // Update the employee's card_id
    await db.execute(
      'UPDATE users SET card_id = ? WHERE user_id = ?',
      [cleanCardId, userId]
    );

    return NextResponse.json({
      success: true,
      message: cleanCardId 
        ? `Card successfully assigned to employee ${userId}` 
        : `Card unassigned from employee ${userId}`
    });

  } catch (error) {
    console.error('Assign Card Error:', error);
    return NextResponse.json(
      { error: 'Failed to update employee card' },
      { status: 500 }
    );
  }
}