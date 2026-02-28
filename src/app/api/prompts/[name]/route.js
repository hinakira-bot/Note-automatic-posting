import { NextResponse } from 'next/server';
import { loadPrompt, savePrompt, resetPrompt } from '@/prompt-manager.js';

/** GET /api/prompts/[name] — プロンプト内容取得 */
export async function GET(request, { params }) {
  try {
    const { name } = await params;
    const content = loadPrompt(name);
    return NextResponse.json({ name, content });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}

/** PUT /api/prompts/[name] — プロンプト保存 */
export async function PUT(request, { params }) {
  try {
    const { name } = await params;
    const body = await request.json();

    if (!body.content && body.content !== '') {
      return NextResponse.json({ error: 'contentが必要です' }, { status: 400 });
    }

    savePrompt(name, body.content);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

/** DELETE /api/prompts/[name] — プロンプトをデフォルトにリセット */
export async function DELETE(request, { params }) {
  try {
    const { name } = await params;
    resetPrompt(name);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
