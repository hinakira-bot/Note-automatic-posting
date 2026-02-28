import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, readdirSync, statSync, mkdirSync } from 'fs';
import { resolve, basename, extname } from 'path';
import config from './config.js';
import logger from './logger.js';

const KNOWLEDGE_DIR = config.paths.knowledge;
const SUPPORTED_FORMATS = ['.txt', '.pdf'];
const DEFAULT_MAX_FILE_KB = 100;
const DEFAULT_MAX_TOTAL_CHARS = 50000;

/**
 * ナレッジディレクトリを確保
 */
function ensureDir() {
  mkdirSync(KNOWLEDGE_DIR, { recursive: true });
}

/**
 * 設定値を取得（settings.json対応）
 */
function getLimits() {
  try {
    const settingsPath = config.paths.settings;
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      return {
        maxFileSizeKB: settings.knowledge?.maxFileSizeKB || DEFAULT_MAX_FILE_KB,
        maxTotalChars: settings.knowledge?.maxTotalChars || DEFAULT_MAX_TOTAL_CHARS,
      };
    }
  } catch { /* ignore */ }
  return { maxFileSizeKB: DEFAULT_MAX_FILE_KB, maxTotalChars: DEFAULT_MAX_TOTAL_CHARS };
}

/**
 * ナレッジファイル一覧を返す
 */
export function listKnowledgeFiles() {
  ensureDir();
  const files = readdirSync(KNOWLEDGE_DIR)
    .filter((f) => SUPPORTED_FORMATS.includes(extname(f).toLowerCase()))
    .map((f) => {
      const fullPath = resolve(KNOWLEDGE_DIR, f);
      const stat = statSync(fullPath);
      return {
        filename: f,
        path: fullPath,
        size: stat.size,
        sizeKB: Math.round(stat.size / 1024),
        format: extname(f).toLowerCase().replace('.', ''),
        addedAt: stat.mtime.toISOString(),
      };
    });
  return files;
}

/**
 * ナレッジファイルを追加（コピー）
 */
export function addKnowledgeFile(sourcePath) {
  ensureDir();
  const absPath = resolve(sourcePath);
  if (!existsSync(absPath)) {
    throw new Error(`ファイルが見つかりません: ${absPath}`);
  }

  const ext = extname(absPath).toLowerCase();
  if (!SUPPORTED_FORMATS.includes(ext)) {
    throw new Error(`未対応の形式です: ${ext} (対応: ${SUPPORTED_FORMATS.join(', ')})`);
  }

  const filename = basename(absPath);
  const destPath = resolve(KNOWLEDGE_DIR, filename);

  if (existsSync(destPath)) {
    throw new Error(`同名のファイルが既に存在します: ${filename}`);
  }

  copyFileSync(absPath, destPath);
  const sizeKB = Math.round(statSync(destPath).size / 1024);
  logger.info(`ナレッジ追加: ${filename} (${sizeKB}KB)`);
  return { filename, path: destPath, sizeKB };
}

/**
 * ナレッジファイルを削除
 */
export function removeKnowledgeFile(filename) {
  const filePath = resolve(KNOWLEDGE_DIR, filename);
  if (!existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filename}`);
  }
  unlinkSync(filePath);
  logger.info(`ナレッジ削除: ${filename}`);
}

/**
 * テキストを抽出（形式に応じて）
 */
async function extractText(filePath, format) {
  if (format === 'txt') {
    return readFileSync(filePath, 'utf-8');
  }
  if (format === 'pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text;
    } catch (err) {
      logger.warn(`PDF読み込みエラー (${basename(filePath)}): ${err.message}`);
      return '';
    }
  }
  return '';
}

/**
 * 単一ナレッジファイルの内容を読み込む
 */
export async function loadKnowledgeFile(filename) {
  const filePath = resolve(KNOWLEDGE_DIR, filename);
  if (!existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filename}`);
  }
  const format = extname(filename).toLowerCase().replace('.', '');
  return extractText(filePath, format);
}

/**
 * 全ナレッジファイルを読み込み、結合して返す
 * プロンプトに注入される文字列を生成
 */
export async function loadAllKnowledge() {
  const files = listKnowledgeFiles();
  if (files.length === 0) return '';

  const limits = getLimits();
  const sections = [];

  for (const file of files) {
    if (file.sizeKB > limits.maxFileSizeKB) {
      logger.warn(`ナレッジファイルが大きすぎます (${file.sizeKB}KB > ${limits.maxFileSizeKB}KB): ${file.filename}`);
    }

    const content = await extractText(file.path, file.format);
    if (content.trim()) {
      sections.push(`--- ${file.filename} ---\n${content}`);
    }
  }

  let combined = sections.join('\n\n');

  // 上限チェック
  if (combined.length > limits.maxTotalChars) {
    logger.warn(`ナレッジ合計が上限超過 (${combined.length}文字 > ${limits.maxTotalChars}文字) - 切り詰めます`);
    combined = combined.slice(0, limits.maxTotalChars) + '\n\n... (以下省略)';
  }

  return combined;
}

/**
 * バッファからナレッジファイルを保存（Webアップロード用）
 */
export async function addKnowledgeFromBuffer(buffer, filename) {
  ensureDir();

  const ext = extname(filename).toLowerCase();
  if (!SUPPORTED_FORMATS.includes(ext)) {
    throw new Error(`未対応の形式です: ${ext} (対応: ${SUPPORTED_FORMATS.join(', ')})`);
  }

  const destPath = resolve(KNOWLEDGE_DIR, filename);
  if (existsSync(destPath)) {
    throw new Error(`同名のファイルが既に存在します: ${filename}`);
  }

  const limits = getLimits();
  const sizeKB = Math.round(buffer.length / 1024);
  if (sizeKB > limits.maxFileSizeKB) {
    throw new Error(`ファイルサイズが上限を超えています (${sizeKB}KB > ${limits.maxFileSizeKB}KB)`);
  }

  writeFileSync(destPath, buffer);
  logger.info(`ナレッジ追加 (Web): ${filename} (${sizeKB}KB)`);
  return { filename, path: destPath, sizeKB };
}
