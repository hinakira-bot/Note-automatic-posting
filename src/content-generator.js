import { GoogleGenerativeAI } from '@google/generative-ai';
import config from './config.js';
import logger from './logger.js';
import { loadPrompt, renderPrompt } from './prompt-manager.js';
import { formatAnalysisForPrompt, formatLatestNewsForPrompt } from './competitor-analyzer.js';
import { getSetting } from './settings-manager.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const textModel = genAI.getGenerativeModel({ model: config.gemini.textModel });

/**
 * STEP 1: 検索意図を分析
 */
async function analyzeSearchIntent(keyword, analysisData, baseVars) {
  logger.info(`検索意図を分析中: "${keyword || '(説明のみモード)'}"`);

  const template = loadPrompt('article-search-intent');
  const prompt = renderPrompt(template, {
    ...baseVars,
    analysisData: formatAnalysisForPrompt(analysisData),
  });

  const result = await textModel.generateContent(prompt);
  const text = result.response.text();
  return parseJSON(text);
}

/**
 * STEP 2: 見出し構成を作成
 */
async function generateOutline(keyword, analysisData, searchIntent, baseVars) {
  logger.info(`見出し構成を作成中: "${keyword || '(説明のみモード)'}"`);

  const template = loadPrompt('article-outline');
  const prompt = renderPrompt(template, {
    ...baseVars,
    searchIntent: JSON.stringify(searchIntent, null, 2),
    analysisData: formatAnalysisForPrompt(analysisData),
  });

  const result = await textModel.generateContent(prompt);
  const text = result.response.text();
  return parseJSON(text);
}

/**
 * STEP 3: タイトルを生成
 */
async function generateTitle(keyword, outline, searchIntent, baseVars) {
  logger.info(`タイトルを生成中: "${keyword || '(説明のみモード)'}"`);

  const headings = outline.outline.map((o) => o.h2).join(' / ');

  const template = loadPrompt('article-title');
  const prompt = renderPrompt(template, {
    ...baseVars,
    headings,
    userNeeds: searchIntent.userNeeds,
  });

  const result = await textModel.generateContent(prompt);
  const text = result.response.text();
  return parseJSON(text);
}

/**
 * STEP 4: 本文を生成
 */
async function generateBody(keyword, title, outline, searchIntent, baseVars) {
  logger.info(`本文を生成中: "${keyword || '(説明のみモード)'}"`);

  const outlineText = outline.outline
    .map(
      (o) =>
        `## ${o.h2}\n${o.h3s.map((h3) => `### ${h3}`).join('\n')}`
    )
    .join('\n\n');

  // 設定のターゲット読者が優先、なければAI分析結果を使用
  const targetAudience = baseVars.settingsTargetAudience || searchIntent.targetAudience || '';
  if (baseVars.settingsTargetAudience) {
    logger.info(`ターゲット読者（設定値）: ${baseVars.settingsTargetAudience}`);
  }

  const template = loadPrompt('article-body');
  const prompt = renderPrompt(template, {
    ...baseVars,
    title,
    outline: outlineText,
    userNeeds: searchIntent.userNeeds,
    targetAudience,
  });

  const result = await textModel.generateContent(prompt);
  let bodyHtml = result.response.text().replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

  // テーブルを箇条書きに変換（note.comはtable非対応）
  bodyHtml = convertTablesToLists(bodyHtml);

  // 1文ずつ改段落に変換（スマホ読みやすさ対応）
  const beforePCount = (bodyHtml.match(/<p>/gi) || []).length;
  bodyHtml = splitSentencesToParagraphs(bodyHtml);
  const afterPCount = (bodyHtml.match(/<p>/gi) || []).length;
  logger.info(`1文改段落処理: ${beforePCount}段落 → ${afterPCount}段落 (${afterPCount - beforePCount}段落増加)`);

  // プレーンURLをテキストリンクに変換（<a>タグ内のURLは除外）
  bodyHtml = convertPlainUrlsToLinks(bodyHtml);

  // メルマガCTAを挿入（最初のh2前 + 記事末尾）
  bodyHtml = insertNewsletterCTA(bodyHtml);

  return bodyHtml;
}

/**
 * テキストを日本語の文末（。！？）で個別の文に分割
 */
function splitIntoSentences(text) {
  // 。！？!? + 直後の閉じ括弧をキャプチャグループで分割
  const parts = text.split(/([。！？!?][）」』】\)]*)/);
  const sentences = [];
  let current = '';

  for (let i = 0; i < parts.length; i++) {
    current += parts[i];
    // 奇数インデックスは区切り文字（句点+閉じ括弧） → 文の終わり
    if (i % 2 === 1) {
      const trimmed = current.trim();
      if (trimmed) sentences.push(trimmed);
      current = '';
    }
  }
  // 最後の残り（句点なしで終わる文）
  const remaining = current.trim();
  if (remaining) sentences.push(remaining);

  return sentences;
}

/**
 * <p>タグ内の複数文を1文ずつ個別の<p>タグに分割
 * スマホでの読みやすさを重視し、各文を独立した段落にする
 *
 * 処理手順:
 * 1. <p>タグで囲まれたテキストの中に複数の文があれば分割
 * 2. ブロック要素間の裸テキスト（<p>なし）も<p>で囲んで分割
 */
function splitSentencesToParagraphs(html) {
  // === Step 1: <p>タグ内の複数文を分割 ===
  let result = html.replace(/<p>([\s\S]*?)<\/p>/gi, (match, content) => {
    // HTMLタグを除去してテキスト部分のみ取得
    const textOnly = content.replace(/<[^>]*>/g, '').trim();

    // 短いテキスト（1文程度）はスキップ
    if (textOnly.length < 40) return match;

    // 文末の数をカウント
    const endCount = (textOnly.match(/[。！？!?]/g) || []).length;
    if (endCount <= 1) return match;

    // 文ごとに分割（テキストベース、インラインHTMLは除去される）
    const sentences = splitIntoSentences(textOnly);
    if (sentences.length <= 1) return match;

    return sentences.map(s => `<p>${s}</p>`).join('\n');
  });

  // === Step 2: ブロック要素間の裸テキストを<p>で囲む ===
  // AIが<p>タグなしでテキストを出力した場合の対策
  // 例: </h2>テキスト。テキスト。<h3> → </h2><p>テキスト。</p><p>テキスト。</p><h3>
  result = result.replace(
    /(<\/h[23]>)\s*\n?((?:(?!<(?:h[23]|p|ul|ol|table|blockquote|div|img)\b)[\s\S])+?)(\s*<(?:h[23]|p|ul|ol|table|blockquote|div|img)\b)/gi,
    (match, closeTag, textBlock, nextTag) => {
      const text = textBlock.replace(/<[^>]*>/g, '').trim();
      if (!text || text.length < 10) return match;

      const sentences = splitIntoSentences(text);
      if (sentences.length === 0) return match;

      const pTags = sentences.map(s => `<p>${s}</p>`).join('\n');
      return `${closeTag}\n${pTags}\n${nextTag}`;
    }
  );

  return result;
}

/**
 * メルマガCTAを記事本文に挿入
 * - 最初の<h2>の直前（導入文の後）に短いCTA
 * - 記事末尾に詳細な登録特典付きCTA
 */
function insertNewsletterCTA(html) {
  const NEWSLETTER_URL = 'https://hinakira.net/p/r/RwKLzKtX';

  // --- 短いCTA（最初のh2の直前） ---
  const shortCTA = [
    '<p>▶ <a href="' + NEWSLETTER_URL + '">AIを学び、使えるようになるメルマガ登録はこちら</a></p>',
  ].join('\n');

  // --- 詳細CTA（記事末尾） ---
  const detailedCTA = [
    '<p>AIについてもっと詳しく学びたい方、僕が作ったツールを使ってみたい方は、ぜひメルマガに登録してみてくださいね。</p>',
    '<p>登録特典がかなり充実しています。</p>',
    '<ul>',
    '<li><strong>GPTsの作り方動画</strong>をプレゼント</li>',
    '<li><strong>有料レベルのAIツール</strong>が使える</li>',
    '<li><strong>限定オープンチャット</strong>へご案内</li>',
    '</ul>',
    '<p>さらに、随時プロンプトやAIツールのプレゼントも配布しているので、登録しておくだけで「得」できますよ〜。</p>',
    '<p>▶ <a href="' + NEWSLETTER_URL + '">AIを学び、使えるようになるメルマガ登録はこちら</a></p>',
  ].join('\n');

  // 最初の<h2>を見つけて直前にCTAを挿入
  const firstH2Match = html.match(/<h2[\s>]/i);
  if (firstH2Match) {
    const insertPos = html.indexOf(firstH2Match[0]);
    html = html.slice(0, insertPos) + shortCTA + '\n' + html.slice(insertPos);
    logger.info('メルマガCTA挿入: 最初のh2前');
  }

  // 記事末尾にCTAを追加
  html = html + '\n' + detailedCTA;
  logger.info('メルマガCTA挿入: 記事末尾');

  return html;
}

/**
 * HTMLテーブルを箇条書き（<ul><li>）に変換
 * note.comのエディタは<table>タグに対応していないため、
 * AIがテーブルを生成してしまった場合のフォールバック処理
 *
 * 変換ロジック:
 * - <th> のセルはヘッダー行として <strong> で強調
 * - <td> のセルは「ヘッダー: 値」形式で箇条書き化
 * - ヘッダー行がない場合はセル内容をそのまま列挙
 */
function convertTablesToLists(html) {
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  const tables = html.match(tableRegex);
  if (!tables) return html;

  let convertCount = 0;

  const result = html.replace(tableRegex, (tableHtml) => {
    convertCount++;

    // 行を抽出
    const rows = [];
    const rowRegex = /<tr[\s>][\s\S]*?<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const cells = [];
      const cellRegex = /<(th|td)[\s>][\s\S]*?<\/\1>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
        const isHeader = cellMatch[1].toLowerCase() === 'th';
        // セル内のHTMLタグを除去してテキスト取得（<strong>等は残す）
        const cellText = cellMatch[0]
          .replace(/<\/?(?:th|td)[\s>][^>]*>/gi, '')
          .replace(/<\/?(?:th|td)>/gi, '')
          .trim();
        cells.push({ text: cellText, isHeader });
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length === 0) return '';

    // ヘッダー行を検出（全セルがthの行）
    const headerRow = rows[0]?.every(c => c.isHeader) ? rows[0] : null;
    const dataRows = headerRow ? rows.slice(1) : rows;

    // 箇条書きに変換
    const listItems = [];

    for (const row of dataRows) {
      if (headerRow && row.length === headerRow.length) {
        // ヘッダーと値をペアにして表示
        const parts = row.map((cell, i) => {
          const header = headerRow[i]?.text;
          if (header && cell.text) {
            return `<strong>${header}</strong>: ${cell.text}`;
          }
          return cell.text;
        }).filter(Boolean);
        listItems.push(parts.join(' / '));
      } else {
        // ヘッダーなし: セル内容を結合
        const text = row.map(c => c.text).filter(Boolean).join(' / ');
        if (text) listItems.push(text);
      }
    }

    if (listItems.length === 0) return '';

    return '<ul>\n' + listItems.map(item => `<li>${item}</li>`).join('\n') + '\n</ul>';
  });

  if (convertCount > 0) {
    logger.info(`テーブル→箇条書き変換: ${convertCount}件`);
  }

  return result;
}

/**
 * プレーンURL（<a>タグで囲まれていないURL）をテキストリンクに変換
 * 例: <p>https://example.com</p> → <p><a href="https://example.com">こちらのリンク</a></p>
 * 例: <p>詳しくは https://example.com をご覧ください</p>
 *   → <p>詳しくは <a href="https://example.com">こちら</a> をご覧ください</p>
 */
function convertPlainUrlsToLinks(html) {
  // <a>タグ内のURLはスキップし、それ以外のURLをリンクに変換
  // 1. まず<a>タグ部分を一時的にプレースホルダーに置換
  const aTagPlaceholders = [];
  let processed = html.replace(/<a\s[^>]*>[\s\S]*?<\/a>/gi, (match) => {
    aTagPlaceholders.push(match);
    return `__ATAG_PLACEHOLDER_${aTagPlaceholders.length - 1}__`;
  });

  // 2. プレーンURLを検出してリンクに変換
  const urlRegex = /(https?:\/\/[^\s<>"'）」』】\)]+)/g;
  let convertCount = 0;
  processed = processed.replace(urlRegex, (url) => {
    convertCount++;
    // URLの前後のテキストから適切なリンクテキストを推測
    // シンプルに「こちら」テキストリンクにする
    return `<a href="${url}">こちらのリンク</a>`;
  });

  // 3. <a>タグプレースホルダーを復元
  for (let i = 0; i < aTagPlaceholders.length; i++) {
    processed = processed.replace(`__ATAG_PLACEHOLDER_${i}__`, aTagPlaceholders[i]);
  }

  if (convertCount > 0) {
    logger.info(`プレーンURL→リンク変換: ${convertCount}件`);
  }

  return processed;
}

/**
 * 記事全体を生成するメインフロー
 * @param {string} keyword - キーワード（空の場合あり）
 * @param {object} analysisData - 競合分析データ
 * @param {object} context - {description, knowledge, latestNews, mode}
 */
export async function generateArticle(keyword, analysisData, context = {}) {
  const { description = '', knowledge = '', latestNews = null, mode = 'keyword-only' } = context;
  logger.info(`=== 記事生成開始: "${keyword || description.slice(0, 30)}" (${mode}) ===`);

  // 最新情報をテキスト化
  const latestNewsText = latestNews ? formatLatestNewsForPrompt(latestNews) : '';
  if (latestNewsText) {
    logger.info(`最新情報をプロンプトに反映: ${latestNewsText.length}文字`);
  }

  // 設定からターゲット読者を取得
  const settingsTargetAudience = getSetting('article.targetAudience', '');

  // 全ステップ共通の変数
  const baseVars = {
    keyword: keyword || '(キーワード未指定)',
    description,
    knowledge,
    latestNews: latestNewsText,
    minLength: String(config.posting.minLength),
    maxLength: String(config.posting.maxLength),
    settingsTargetAudience,
  };

  // STEP 1: 検索意図分析
  const searchIntent = await analyzeSearchIntent(keyword, analysisData, baseVars);
  logger.info(`検索意図: ${searchIntent.searchIntent} - ${searchIntent.userNeeds}`);

  // STEP 2: 見出し構成
  const outline = await generateOutline(keyword, analysisData, searchIntent, baseVars);
  logger.info(`見出し構成: h2 × ${outline.outline.length}個`);

  // STEP 3: タイトル生成
  const titleData = await generateTitle(keyword, outline, searchIntent, baseVars);
  const title = titleData.titles[titleData.recommended || 0];
  logger.info(`タイトル: ${title}`);

  // STEP 4: 本文生成
  const bodyHtml = await generateBody(keyword, title, outline, searchIntent, baseVars);
  logger.info(`本文生成完了: ${bodyHtml.length}文字`);

  return {
    keyword,
    title,
    titleCandidates: titleData.titles,
    outline: outline.outline,
    bodyHtml,
    searchIntent,
  };
}

/** JSONパーサー（コードブロック対応） */
function parseJSON(text) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // JSON部分を抽出して再試行
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error(`JSON解析エラー: ${e.message}\n元のテキスト: ${cleaned.slice(0, 200)}`);
  }
}
