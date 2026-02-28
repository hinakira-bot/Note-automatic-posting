import { NextResponse } from 'next/server';
import { getMaskedCredentials, saveCredentials, isConfigured } from '@/lib/credentials-manager.js';

/**
 * GET /api/credentials — マスクされたクレデンシャル情報を返す
 * ※ 実際のAPIキー・パスワードは返さない（先頭数文字+***のみ）
 */
export async function GET() {
  try {
    const masked = getMaskedCredentials();
    return NextResponse.json(masked);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/credentials — クレデンシャルを保存
 * ※ 空文字のフィールドは既存値を維持（部分更新OK）
 */
export async function POST(request) {
  try {
    const body = await request.json();

    // 必須項目チェック（初回セットアップ時のみ）
    if (!isConfigured()) {
      if (!body.geminiApiKey) {
        return NextResponse.json({ error: 'Gemini APIキーは必須です' }, { status: 400 });
      }
      if (!body.noteEmail || !body.notePassword) {
        return NextResponse.json({ error: 'Note メールアドレス・パスワードは必須です' }, { status: 400 });
      }
    }

    saveCredentials(body);

    return NextResponse.json({
      success: true,
      isConfigured: isConfigured(),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
