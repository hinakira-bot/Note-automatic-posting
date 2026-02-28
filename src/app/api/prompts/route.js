import { NextResponse } from 'next/server';
import { listPrompts } from '@/prompt-manager.js';

/** GET /api/prompts — プロンプト一覧 */
export async function GET() {
  try {
    const prompts = listPrompts();
    return NextResponse.json({ prompts });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
