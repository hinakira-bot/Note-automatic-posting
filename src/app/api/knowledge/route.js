import { NextResponse } from 'next/server';
import { listKnowledgeFiles, addKnowledgeFromBuffer } from '@/knowledge-manager.js';

/** GET /api/knowledge — ナレッジファイル一覧 */
export async function GET() {
  try {
    const files = listKnowledgeFiles();
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/knowledge — ナレッジファイルアップロード */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await addKnowledgeFromBuffer(buffer, file.name);

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
