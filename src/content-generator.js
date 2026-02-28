import { GoogleGenerativeAI } from '@google/generative-ai';
import config from './config.js';
import logger from './logger.js';
import { loadPrompt, renderPrompt } from './prompt-manager.js';
import { formatAnalysisForPrompt, formatLatestNewsForPrompt } from './competitor-analyzer.js';

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

  const template = loadPrompt('article-body');
  const prompt = renderPrompt(template, {
    ...baseVars,
    title,
    outline: outlineText,
    userNeeds: searchIntent.userNeeds,
    targetAudience: searchIntent.targetAudience,
  });

  const result = await textModel.generateContent(prompt);
  let bodyHtml = result.response.text().replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

  // 1文ずつ改段落に変換（スマホ読みやすさ対応）
  bodyHtml = splitSentencesToParagraphs(bodyHtml);
  logger.info(`本文の1文改段落処理を適用しました`);

  return bodyHtml;
}

/**
 * <p>タグ内の複数文を1文ずつ個別の<p>タグに分割
 * スマホでの読みやすさを重視し、各文を独立した段落にする
 */
function splitSentencesToParagraphs(html) {
  return html.replace(/<p>([\s\S]*?)<\/p>/gi, (match, content) => {
    // 短い段落（1文程度）はそのまま
    const textOnly = content.replace(/<[^>]*>/g, '');
    if (textOnly.length < 60) return match;

    // 日本語の文末（。！？）の後ろで分割
    // ただし閉じ括弧・引用符の直前では分割しない
    const parts = content
      .split(/(?<=[。！？!?])\s*(?=[^）」』】\)>\s<]|<(?!\/))/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (parts.length <= 1) return match;

    return parts.map(s => `<p>${s}</p>`).join('\n');
  });
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

  // 全ステップ共通の変数
  const baseVars = {
    keyword: keyword || '(キーワード未指定)',
    description,
    knowledge,
    latestNews: latestNewsText,
    minLength: String(config.posting.minLength),
    maxLength: String(config.posting.maxLength),
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
