import { NextResponse } from 'next/server';
import { getScreenshot } from '../../../../lib/interactive-session.js';

/** GET /api/session/screenshot — 現在のスクリーンショット（base64 JSON） */
export async function GET() {
  const base64 = await getScreenshot();
  if (!base64) {
    return NextResponse.json({ image: null });
  }
  return NextResponse.json({ image: base64 });
}
