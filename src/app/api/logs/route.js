import { NextResponse } from 'next/server';
import { getPostLog } from '@/post-logger.js';

/** GET /api/logs — 投稿ログ一覧 */
export async function GET() {
  try {
    const posts = getPostLog();
    // 新しい順にソート
    const sorted = [...posts].sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    return NextResponse.json({ posts: sorted });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
