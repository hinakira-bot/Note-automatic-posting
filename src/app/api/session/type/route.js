import { NextResponse } from 'next/server';
import { typeText, pressKey } from '../../../../lib/interactive-session.js';

/** POST /api/session/type — キーボード入力送信 */
export async function POST(request) {
  try {
    const { text, key } = await request.json();

    // 特殊キー（Enter, Tab, Backspace等）
    if (key) {
      await pressKey(key);
      return NextResponse.json({ ok: true });
    }

    // テキスト入力
    if (text) {
      await typeText(text);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: 'text または key を指定してください' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
