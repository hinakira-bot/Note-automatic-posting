import { NextResponse } from 'next/server';
import { loadKnowledgeFile, removeKnowledgeFile } from '@/knowledge-manager.js';

/** GET /api/knowledge/[filename] — ナレッジファイル内容取得 */
export async function GET(request, { params }) {
  try {
    const { filename } = await params;
    const content = await loadKnowledgeFile(decodeURIComponent(filename));
    return NextResponse.json({ filename, content });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}

/** DELETE /api/knowledge/[filename] — ナレッジファイル削除 */
export async function DELETE(request, { params }) {
  try {
    const { filename } = await params;
    removeKnowledgeFile(decodeURIComponent(filename));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}
