import { NextResponse } from 'next/server';
import { loadSettings, updateSetting } from '@/settings-manager.js';

/** GET /api/settings — 全設定取得 */
export async function GET() {
  try {
    const settings = loadSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** PUT /api/settings — 設定更新 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const { updates } = body;

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'updatesオブジェクトが必要です' }, { status: 400 });
    }

    // { "article.minLength": 3000, "posting.dryRun": true } 形式
    for (const [path, value] of Object.entries(updates)) {
      updateSetting(path, value);
    }

    const settings = loadSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
