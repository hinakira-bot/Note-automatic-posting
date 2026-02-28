import { NextResponse } from 'next/server';
import {
  startInteractiveSession,
  closeInteractiveSession,
  getSessionState,
} from '../../../lib/interactive-session.js';

/** GET /api/session — 状態取得 */
export async function GET() {
  return NextResponse.json(getSessionState());
}

/** POST /api/session — 対話型セッション開始 */
export async function POST() {
  try {
    await startInteractiveSession();
    return NextResponse.json({ ok: true, ...getSessionState() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

/** DELETE /api/session — セッション終了 */
export async function DELETE() {
  await closeInteractiveSession();
  return NextResponse.json({ ok: true });
}
