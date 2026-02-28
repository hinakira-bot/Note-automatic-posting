import { NextResponse } from 'next/server';
import { clickAt } from '../../../../lib/interactive-session.js';

/** POST /api/session/click — 指定座標をクリック */
export async function POST(request) {
  try {
    const { x, y } = await request.json();

    if (typeof x !== 'number' || typeof y !== 'number') {
      return NextResponse.json(
        { error: '座標(x, y)を指定してください' },
        { status: 400 }
      );
    }

    await clickAt(x, y);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
