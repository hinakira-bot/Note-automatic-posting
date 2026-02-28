import { NextResponse } from 'next/server';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const SESSION_DIR = resolve(process.cwd(), 'data', 'session');

/** POST /api/session/upload — セッションファイルをアップロード */
export async function POST(request) {
  try {
    const body = await request.json();
    const { sessionData } = body;

    if (!sessionData) {
      return NextResponse.json(
        { error: 'セッションデータがありません' },
        { status: 400 }
      );
    }

    // JSON として解析できるか確認
    let parsed;
    try {
      parsed = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
    } catch {
      return NextResponse.json(
        { error: 'セッションデータの形式が正しくありません（JSON）' },
        { status: 400 }
      );
    }

    // Playwright storageState 形式の基本チェック
    if (!parsed.cookies && !parsed.origins) {
      return NextResponse.json(
        { error: 'Playwright storageState 形式ではありません（cookies/origins が必要）' },
        { status: 400 }
      );
    }

    // 保存
    mkdirSync(SESSION_DIR, { recursive: true });
    writeFileSync(
      resolve(SESSION_DIR, 'state.json'),
      JSON.stringify(parsed, null, 2)
    );

    const cookieCount = parsed.cookies?.length || 0;
    return NextResponse.json({
      ok: true,
      message: `セッションを保存しました（Cookie: ${cookieCount}件）`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `保存エラー: ${err.message}` },
      { status: 500 }
    );
  }
}
