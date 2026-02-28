/**
 * Next.js Instrumentation Hook
 *
 * スケジューラーは server.mjs（カスタムサーバー）側で管理。
 * instrumentation.js ではサーバー起動時の初期化処理のみ行う。
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[init] Note Auto Poster サーバー初期化');
  }
}
