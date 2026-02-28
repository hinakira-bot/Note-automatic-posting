import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';
import config from './config.js';
import logger from './logger.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

/**
 * Gemini + Google Search Grounding で検索意図と競合情報を取得
 */
async function searchWithGemini(keyword) {
  logger.info(`Gemini Google Search で分析中: "${keyword}"`);

  const model = genAI.getGenerativeModel({
    model: config.gemini.textModel,
    tools: [{ googleSearch: {} }],
  });

  const prompt = `以下のキーワードでGoogle検索した場合の上位記事を分析してください。

キーワード: "${keyword}"

以下の情報をJSON形式で出力してください。JSON以外のテキストは不要です。
{
  "searchResults": [
    { "title": "記事タイトル", "url": "URL", "snippet": "概要" }
  ],
  "topHeadings": [
    {
      "articleTitle": "記事タイトル",
      "headings": [
        { "tag": "h2", "text": "見出しテキスト" }
      ]
    }
  ],
  "searchIntent": "informational / navigational / transactional / commercial のいずれか",
  "commonTopics": ["よく扱われているトピック1", "トピック2", "トピック3"],
  "avgWordCount": 3000,
  "avgH2Count": 5
}

上位5〜10件の記事について分析してください。`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseJSON(text);
}

/**
 * 上位記事のURLから直接見出し構造を抽出（補助）
 */
async function extractHeadings(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const headings = [];
    $('h1, h2, h3').each((_, el) => {
      const tag = el.tagName.toLowerCase();
      const text = $(el).text().trim();
      if (text && text.length < 200) {
        headings.push({ tag, text });
      }
    });

    const bodyText = $('article, .entry-content, .post-content, main, .content')
      .first()
      .text()
      .trim();
    const charCount = bodyText.length || $('body').text().trim().length;

    return { url, headings, charCount };
  } catch (err) {
    logger.debug(`ページ取得失敗 (${url}): ${err.message}`);
    return null;
  }
}

/**
 * キーワードの競合分析（メイン）
 */
export async function analyzeCompetitors(keyword) {
  logger.info(`=== 競合分析開始: "${keyword}" ===`);

  // Gemini + Google Search で分析
  const geminiAnalysis = await searchWithGemini(keyword);

  // 上位記事のURLがあれば直接見出しも取得
  const urls = (geminiAnalysis.searchResults || [])
    .map((r) => r.url)
    .filter((u) => u && u.startsWith('http'))
    .slice(0, 3);

  let articles = [];
  if (urls.length > 0) {
    logger.info(`上位${urls.length}記事の見出しを直接取得中...`);
    const results = await Promise.all(urls.map((u) => extractHeadings(u)));
    articles = results.filter(Boolean);
  }

  const summary = {
    keyword,
    totalArticles: geminiAnalysis.searchResults?.length || 0,
    avgCharCount: geminiAnalysis.avgWordCount || 3000,
    commonH2Count: geminiAnalysis.avgH2Count || 5,
    searchIntent: geminiAnalysis.searchIntent || 'informational',
    commonTopics: geminiAnalysis.commonTopics || [],
    topHeadings: geminiAnalysis.topHeadings || [],
  };

  logger.info(
    `分析完了 - 検索意図: ${summary.searchIntent}, 平均文字数: ${summary.avgCharCount}`
  );

  return {
    keyword,
    searchResults: geminiAnalysis.searchResults || [],
    articles,
    summary,
  };
}

/**
 * 競合分析結果をプロンプト用テキストに変換
 */
export function formatAnalysisForPrompt(analysis) {
  let text = `## 競合分析データ\n`;
  text += `キーワード: ${analysis.keyword}\n`;
  text += `分析記事数: ${analysis.summary?.totalArticles || 0}件\n`;
  text += `平均文字数: ${analysis.summary?.avgCharCount || 0}字\n`;
  text += `平均h2数: ${analysis.summary?.commonH2Count || 0}個\n`;
  text += `検索意図: ${analysis.summary?.searchIntent || '不明'}\n`;
  text += `共通トピック: ${(analysis.summary?.commonTopics || []).join(', ')}\n\n`;

  text += `### 検索結果タイトル一覧\n`;
  for (const r of (analysis.searchResults || []).slice(0, 10)) {
    text += `- ${r.title}\n`;
  }

  if (analysis.summary?.topHeadings?.length > 0) {
    text += `\n### 上位記事の見出し構成 (Gemini分析)\n`;
    for (const article of analysis.summary.topHeadings) {
      text += `\n--- ${article.articleTitle} ---\n`;
      for (const h of article.headings || []) {
        const indent = h.tag === 'h3' ? '  ' : '';
        text += `${indent}[${h.tag}] ${h.text}\n`;
      }
    }
  }

  if (analysis.articles?.length > 0) {
    text += `\n### 上位記事の見出し構成 (直接取得)\n`;
    for (const article of analysis.articles) {
      text += `\n--- ${article.url} (${article.charCount}字) ---\n`;
      for (const h of article.headings) {
        const indent = h.tag === 'h3' ? '  ' : '';
        text += `${indent}[${h.tag}] ${h.text}\n`;
      }
    }
  }

  return text;
}

/**
 * Gemini + Google Search Grounding で最新情報を取得
 */
export async function searchLatestNews(keyword) {
  logger.info(`最新情報を検索中: "${keyword}"`);

  const model = genAI.getGenerativeModel({
    model: config.gemini.textModel,
    tools: [{ googleSearch: {} }],
  });

  const currentYear = new Date().getFullYear();
  const prompt = `以下のキーワードに関する最新情報・最新ニュースを調査してください。

キーワード: "${keyword}"

特に以下の観点で調査してください：
- ${currentYear}年の最新ニュース・トレンド・アップデート
- 最近発表されたデータ・統計・調査結果
- 業界の最新動向・変化・新サービス
- 法改正・制度変更など最新の公式情報
- 検索上位の既存記事にはまだ含まれていない可能性のある新しい情報

以下のJSON形式で出力してください。JSON以外のテキストは不要です。
{
  "latestNews": [
    {
      "title": "ニュースのタイトルや要約",
      "detail": "具体的な内容（数値・日付含む）",
      "source": "情報源（サイト名やURL）",
      "date": "発表日・掲載日（わかる範囲）"
    }
  ],
  "trends": ["最新トレンド1", "最新トレンド2"],
  "keyInsights": "記事に反映すべき重要な最新ポイントの要約（200字以内）"
}

最新で信頼性の高い情報を5〜10件程度取得してください。`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = parseJSON(text);
    logger.info(`最新情報: ${parsed.latestNews?.length || 0}件取得`);
    return parsed;
  } catch (err) {
    logger.warn(`最新情報検索エラー: ${err.message}`);
    return { latestNews: [], trends: [], keyInsights: '' };
  }
}

/**
 * 最新情報をプロンプト用テキストに変換
 */
export function formatLatestNewsForPrompt(latestNews) {
  if (!latestNews || (!latestNews.latestNews?.length && !latestNews.keyInsights)) {
    return '';
  }

  let text = `## 最新情報（${new Date().getFullYear()}年）\n`;

  if (latestNews.keyInsights) {
    text += `\n### 重要ポイント\n${latestNews.keyInsights}\n`;
  }

  if (latestNews.trends?.length > 0) {
    text += `\n### 最新トレンド\n`;
    for (const trend of latestNews.trends) {
      text += `- ${trend}\n`;
    }
  }

  if (latestNews.latestNews?.length > 0) {
    text += `\n### 最新ニュース\n`;
    for (const news of latestNews.latestNews) {
      text += `- **${news.title}**: ${news.detail}`;
      if (news.date) text += ` (${news.date})`;
      text += `\n`;
    }
  }

  return text;
}

/** JSONパーサー */
function parseJSON(text) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    logger.warn(`JSON解析失敗、デフォルト値を使用: ${e.message}`);
    return {
      searchResults: [],
      topHeadings: [],
      searchIntent: 'informational',
      commonTopics: [],
      avgWordCount: 3000,
      avgH2Count: 5,
    };
  }
}
