import { NextResponse } from 'next/server';
import { listKeywords } from '@/keyword-manager.js';

/** GET /api/keywords/export — CSV形式でキーワードをエクスポート */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // pending, posted, failed, all

    let keywords = listKeywords();
    if (status && status !== 'all') {
      keywords = keywords.filter((k) => k.status === status);
    }

    // BOM + ヘッダー行
    const BOM = '\uFEFF';
    const header = 'keyword,description,category,status,createdAt,postedAt,postUrl';
    const rows = keywords.map((kw) => {
      return [
        csvEscape(kw.keyword || ''),
        csvEscape(kw.description || ''),
        csvEscape(kw.category || ''),
        kw.status || 'pending',
        kw.createdAt || '',
        kw.postedAt || '',
        csvEscape(kw.postUrl || ''),
      ].join(',');
    });

    const csv = BOM + [header, ...rows].join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="keywords-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** CSV用エスケープ（カンマ・改行・ダブルクォートを含む場合） */
function csvEscape(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
