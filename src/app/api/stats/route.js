import { NextResponse } from 'next/server';
import { getStats } from '@/keyword-manager.js';
import { getPostLog } from '@/post-logger.js';

/** GET /api/stats — ダッシュボード統計 */
export async function GET() {
  try {
    const stats = getStats();
    const posts = getPostLog();

    // 最近5件の投稿
    const recentPosts = [...posts]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5);

    return NextResponse.json({ stats, recentPosts });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
