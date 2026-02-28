import { NextResponse } from 'next/server';
import { updateKeyword, deleteKeyword, getKeywordById } from '@/keyword-manager.js';

/** PUT /api/keywords/[id] — キーワード編集 */
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const result = updateKeyword(id, body);
    if (!result) {
      return NextResponse.json({ error: 'キーワードが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE /api/keywords/[id] — キーワード削除 */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const result = deleteKeyword(id);
    if (!result) {
      return NextResponse.json({ error: 'キーワードが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
