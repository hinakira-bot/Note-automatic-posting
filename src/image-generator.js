import { GoogleGenerativeAI } from '@google/generative-ai';
import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import config from './config.js';
import logger from './logger.js';
import { loadPrompt, renderPrompt } from './prompt-manager.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const imageModel = genAI.getGenerativeModel({ model: config.gemini.imageModel });

const REF_IMAGES_DIR = resolve(config.paths.data, 'reference-images');

/**
 * 参照画像を読み込み（指定タイプのもの）
 * @param {'eyecatch' | 'diagram'} type
 * @returns {Array<{inlineData: {data: string, mimeType: string}}>}
 */
function loadReferenceImages(type) {
  if (!existsSync(REF_IMAGES_DIR)) return [];

  const files = readdirSync(REF_IMAGES_DIR).filter((f) => {
    if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(f)) return false;
    // ファイル名のプレフィックスでタイプ判定
    return f.toLowerCase().startsWith(type);
  });

  const images = [];
  for (const filename of files.slice(0, 3)) { // 最大3枚まで
    try {
      const filePath = resolve(REF_IMAGES_DIR, filename);
      const data = readFileSync(filePath);
      const ext = extname(filename).toLowerCase().replace('.', '');
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

      images.push({
        inlineData: {
          data: data.toString('base64'),
          mimeType,
        },
      });
      logger.info(`参照画像読み込み: ${filename}`);
    } catch (err) {
      logger.warn(`参照画像読み込みエラー (${filename}): ${err.message}`);
    }
  }

  return images;
}

/**
 * Gemini Image Preview で画像を生成し、ファイルに保存
 * @param {string} prompt - テキストプロンプト
 * @param {string} outputPath - 出力先パス
 * @param {Array} referenceImages - 参照画像パーツの配列
 * @param {number} retries - リトライ回数
 */
async function generateImage(prompt, outputPath, referenceImages = [], retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      logger.info(`画像生成中 (試行${attempt + 1}): ${prompt.slice(0, 50)}...`);

      // テキストパートを作成
      const parts = [];

      // 参照画像がある場合、先に画像を追加（ただし影響を弱めに）
      if (referenceImages.length > 0) {
        parts.push({ text: `以下の参照画像は「品質レベル」と「全体的な雰囲気」の参考です。\n重要: 参照画像の構図・色・レイアウトをコピーしないでください。毎回まったく異なるデザイン・配色・構図にしてください。参照画像はあくまで品質の目安であり、見た目を真似るものではありません。\n\n` });
        for (const img of referenceImages) {
          parts.push(img);
        }
        parts.push({ text: `\n上記は品質の参考です。以下の内容で、参照画像とは全く異なる構図・配色・表現で新しい画像を生成してください:\n\n${prompt}` });
      } else {
        parts.push({ text: prompt });
      }

      const result = await imageModel.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['image', 'text'],
        },
      });

      const response = result.response;
      const responseParts = response.candidates?.[0]?.content?.parts || [];

      for (const part of responseParts) {
        if (part.inlineData) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          writeFileSync(outputPath, buffer);
          logger.info(`画像保存: ${outputPath}`);
          return outputPath;
        }
      }

      logger.warn(`画像データが見つかりませんでした (試行${attempt + 1})`);
    } catch (err) {
      logger.warn(`画像生成エラー (試行${attempt + 1}): ${err.message}`);
      if (attempt < retries) {
        await sleep(2000 * (attempt + 1));
      }
    }
  }

  logger.error(`画像生成失敗: ${prompt.slice(0, 50)}...`);
  return null;
}

/**
 * タイトルを短縮して画像用テキストを生成（15文字以内目安）
 * 例: 「【2026年版】バイブコーディングの始め方完全ガイド！未経験から最短5ステップ」
 *   → 「バイブコーディング入門」
 */
function shortenTitle(title) {
  if (!title) return '';

  // 【】や括弧、「！」以降を除去
  let short = title
    .replace(/【[^】]*】/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[！!].*/g, '')
    .replace(/[？?].*/g, '')
    .trim();

  // 「完全ガイド」「徹底解説」等の修飾語を除去
  const removePatterns = [
    '完全ガイド', '徹底解説', '完全版', '保存版', '決定版',
    '最新版', '入門ガイド', 'まとめ', '一覧',
    '未経験から', '初心者向け', '初心者必見',
    '最短', 'ステップ', 'おすすめ',
  ];
  for (const pat of removePatterns) {
    short = short.replace(pat, '');
  }

  // 数字+パターンを除去（「5つの」「10選」等）
  short = short.replace(/\d+つの|の\d+選|\d+選/g, '');

  // 余計な記号を除去
  short = short.replace(/[〜～・、。,.\s]+$/g, '').trim();

  // 15文字以内にカット
  if (short.length > 15) {
    short = short.slice(0, 15);
  }

  return short;
}

/**
 * アイキャッチ画像を生成
 */
export async function generateEyecatch(keyword, title, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, 'eyecatch.png');

  // タイトルを短縮して画像用テキストを生成
  const shortTitle = shortenTitle(title);
  logger.info(`アイキャッチ短縮タイトル: "${shortTitle}"`);

  const template = loadPrompt('image-eyecatch');
  const prompt = renderPrompt(template, { keyword, title, shortTitle });

  // アイキャッチ用の参照画像を読み込み
  const refImages = loadReferenceImages('eyecatch');
  if (refImages.length > 0) {
    logger.info(`アイキャッチ参照画像: ${refImages.length}枚`);
  }

  return generateImage(prompt, outputPath, refImages);
}

/**
 * キーワードがハウツー系（始め方、やり方、使い方 等）か判定
 */
function isHowToKeyword(keyword) {
  if (!keyword) return false;
  const patterns = [
    '始め方', 'やり方', '使い方', '方法', '手順', 'ステップ',
    '設定方法', '登録方法', '導入方法', '使用方法', '操作方法',
    '始める', 'インストール', 'セットアップ', '設定',
    '登録', '申し込み', '開設', '作り方', '作成方法',
    'how to', 'tutorial', 'setup', 'install',
  ];
  const kw = keyword.toLowerCase();
  return patterns.some(p => kw.includes(p));
}

/**
 * h2見出し用の図解画像を生成
 * @param {Array} outline - 見出し構成
 * @param {string} outputDir - 出力先
 * @param {string} keyword - キーワード（ハウツー判定用）
 */
export async function generateDiagrams(outline, outputDir, keyword = '') {
  mkdirSync(outputDir, { recursive: true });

  // キーワードがハウツー系ならスクショ風、それ以外は図解
  const useScreenshot = isHowToKeyword(keyword);
  const templateName = useScreenshot ? 'image-screenshot' : 'image-diagram';
  const template = loadPrompt(templateName);
  logger.info(`図解スタイル: ${useScreenshot ? 'スクショ風（ハウツー系）' : '図解/インフォグラフィック'}`);

  const results = [];

  // 図解用の参照画像を読み込み（全図解で共通）
  const refImages = loadReferenceImages('diagram');
  if (refImages.length > 0) {
    logger.info(`図解参照画像: ${refImages.length}枚`);
  }

  for (let i = 0; i < outline.length; i++) {
    const section = outline[i];
    // まとめセクションは図解不要
    if (section.h2.includes('まとめ')) {
      results.push({ index: i, h2: section.h2, imagePath: null });
      continue;
    }

    const outputPath = resolve(outputDir, `diagram-${i}.png`);
    const description = section.diagramDescription || section.h2;

    const prompt = renderPrompt(template, {
      diagramDescription: description,
      sectionH2: section.h2,
      sectionH3s: section.h3s.join(', '),
      keyword: keyword || '',
    });

    // API負荷軽減のため間隔を空ける
    if (i > 0) await sleep(3000);

    const imagePath = await generateImage(prompt, outputPath, refImages);
    results.push({ index: i, h2: section.h2, imagePath });
  }

  return results;
}

/**
 * 全画像を一括生成
 */
export async function generateAllImages(article) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputDir = resolve(config.paths.images, timestamp);
  mkdirSync(outputDir, { recursive: true });

  logger.info(`=== 画像生成開始 (${outputDir}) ===`);

  // アイキャッチ生成
  const eyecatchPath = await generateEyecatch(article.keyword, article.title, outputDir);

  // 図解生成（キーワードでハウツー系判定→スクショ風に切替）
  const diagrams = await generateDiagrams(article.outline, outputDir, article.keyword);

  const successCount = diagrams.filter((d) => d.imagePath).length;
  logger.info(
    `画像生成完了 - アイキャッチ: ${eyecatchPath ? 'OK' : 'NG'}, 図解: ${successCount}/${diagrams.length}枚`
  );

  return { eyecatchPath, diagrams, outputDir };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
