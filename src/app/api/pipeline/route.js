import { NextResponse } from 'next/server';
import { startPipeline, getStatus, resetPipeline } from '@/lib/pipeline-runner.js';

/** POST /api/pipeline — パイプライン実行開始 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { dryRun = false, keywordId } = body;

    await startPipeline({ dryRun, keywordId });
    return NextResponse.json({ success: true, message: 'パイプライン開始' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
}

/** GET /api/pipeline — 現在の実行状態取得 */
export async function GET() {
  try {
    const status = getStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE /api/pipeline — パイプラインを強制リセット */
export async function DELETE() {
  try {
    const result = resetPipeline();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
