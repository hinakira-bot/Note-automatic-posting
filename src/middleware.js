import { NextResponse } from 'next/server';

/**
 * Web UI Basic認証ミドルウェア
 *
 * .env に WEB_USER と WEB_PASSWORD が設定されている場合のみ有効。
 * ローカル開発時は未設定でOK、VPS運用時は必ず設定すること。
 */
export function middleware(request) {
  const user = process.env.WEB_USER;
  const pass = process.env.WEB_PASSWORD;

  // 未設定なら認証なし（ローカル開発用）
  if (!user || !pass) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    try {
      const [scheme, encoded] = authHeader.split(' ');
      if (scheme === 'Basic' && encoded) {
        const decoded = atob(encoded);
        const separatorIndex = decoded.indexOf(':');
        if (separatorIndex > 0) {
          const inputUser = decoded.slice(0, separatorIndex);
          const inputPass = decoded.slice(separatorIndex + 1);
          if (inputUser === user && inputPass === pass) {
            return NextResponse.next();
          }
        }
      }
    } catch {
      // デコード失敗 → 認証失敗扱い
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Note Auto Poster"',
    },
  });
}

export const config = {
  matcher: [
    /*
     * 静的アセット以外の全ルートに適用:
     * - _next/static (静的ファイル)
     * - _next/image (画像最適化)
     * - favicon.ico, icon.svg
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
};
