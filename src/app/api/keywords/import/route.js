import { NextResponse } from 'next/server';
import { addKeyword, listKeywords } from '@/keyword-manager.js';

/** POST /api/keywords/import — CSVからキーワードを一括インポート */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const skipDuplicates = formData.get('skipDuplicates') !== 'false';

    if (!file) {
      return NextResponse.json({ error: 'CSVファイルを選択してください' }, { status: 400 });
    }

    // ファイル内容を読み取り
    let text = await file.text();

    // BOM除去
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }

    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) {
      return NextResponse.json({ error: 'CSVファイルが空です' }, { status: 400 });
    }

    // ヘッダー行の検出
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('keyword') || firstLine.includes('キーワード');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    // ヘッダーからカラム順序を判定
    let colMap = { keyword: 0, description: 1, category: 2 };
    if (hasHeader) {
      const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
      const keywordIdx = headers.findIndex((h) => h === 'keyword' || h === 'キーワード');
      const descIdx = headers.findIndex((h) => h === 'description' || h === '説明' || h === 'desc');
      const catIdx = headers.findIndex((h) => h === 'category' || h === 'カテゴリ' || h === 'cat');

      if (keywordIdx >= 0) colMap.keyword = keywordIdx;
      if (descIdx >= 0) colMap.description = descIdx;
      if (catIdx >= 0) colMap.category = catIdx;
    }

    // 既存キーワード取得（重複チェック用）
    const existing = listKeywords();
    const existingSet = new Set(
      existing.map((k) => `${k.keyword}|||${k.description}`)
    );

    let added = 0;
    let skipped = 0;
    let errors = 0;

    for (const line of dataLines) {
      try {
        const cols = parseCSVLine(line);
        const keyword = (cols[colMap.keyword] || '').trim();
        const description = (cols[colMap.description] || '').trim();
        const category = (cols[colMap.category] || '').trim();

        // 空行スキップ
        if (!keyword && !description) {
          continue;
        }

        // 重複チェック
        const key = `${keyword}|||${description}`;
        if (skipDuplicates && existingSet.has(key)) {
          skipped++;
          continue;
        }

        const result = addKeyword(keyword, category, description);
        if (result) {
          added++;
          existingSet.add(key);
        } else {
          skipped++;
        }
      } catch {
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      added,
      skipped,
      errors,
      total: dataLines.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * CSV行をパースしてフィールド配列に変換
 * ダブルクォートで囲まれたフィールド内のカンマ・改行に対応
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // ダブルクォートのエスケープ ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);

  return fields;
}
