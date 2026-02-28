import { NextResponse } from 'next/server';
import { listKeywords, addKeyword } from '@/keyword-manager.js';

/** GET /api/keywords — キーワード一覧 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let keywords = listKeywords();
    if (status) {
      keywords = keywords.filter((k) => k.status === status);
    }

    return NextResponse.json({ keywords });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/keywords — キーワード追加 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { keyword = '', category = '', description = '' } = body;

    if (!keyword && !description) {
      return NextResponse.json(
        { error: 'キーワードまたは説明を入力してください' },
        { status: 400 }
      );
    }

    const result = addKeyword(keyword, category, description);
    if (!result) {
      return NextResponse.json(
        { error: '同一のキーワード/説明が既に登録されています' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
