import { readFileSync, writeFileSync, existsSync } from 'fs';
import config from './config.js';
import logger from './logger.js';

const KEYWORDS_PATH = config.paths.keywords;

function generateId() {
  return `kw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function loadKeywords() {
  if (!existsSync(KEYWORDS_PATH)) {
    writeFileSync(KEYWORDS_PATH, JSON.stringify({ keywords: [] }, null, 2), 'utf-8');
    return { keywords: [] };
  }
  const data = JSON.parse(readFileSync(KEYWORDS_PATH, 'utf-8'));

  // マイグレーション: id, description フィールドがない既存データを補完
  let migrated = false;
  for (const kw of data.keywords) {
    if (!kw.id) {
      kw.id = generateId();
      migrated = true;
    }
    if (kw.description === undefined) {
      kw.description = '';
      migrated = true;
    }
  }
  if (migrated) {
    saveKeywords(data);
    logger.info('keywords.json をv2フォーマットにマイグレーションしました');
  }

  return data;
}

function saveKeywords(data) {
  writeFileSync(KEYWORDS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/** キーワードを追加（説明付き） */
export function addKeyword(keyword, category = '', description = '') {
  const data = loadKeywords();

  // 重複チェック（keyword + description の組み合わせ）
  const exists = data.keywords.some(
    (k) => k.keyword === keyword && k.description === description
  );
  if (exists) {
    logger.warn(`同一のキーワード/説明が既に登録されています`);
    return false;
  }

  data.keywords.push({
    id: generateId(),
    keyword: keyword || '',
    description: description || '',
    category: category || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
    postedAt: null,
    postUrl: '',
  });
  saveKeywords(data);

  const label = keyword || description.slice(0, 30);
  logger.info(`キーワード追加: "${label}"`);
  return true;
}

/** 複数キーワードを一括追加 */
export function addKeywords(keywords) {
  let added = 0;
  for (const kw of keywords) {
    if (typeof kw === 'string') {
      if (addKeyword(kw)) added++;
    } else {
      if (addKeyword(kw.keyword || '', kw.category || '', kw.description || '')) added++;
    }
  }
  logger.info(`${added}件のキーワードを追加しました`);
  return added;
}

/** キーワードを編集 */
export function updateKeyword(id, updates = {}) {
  const data = loadKeywords();
  const target = data.keywords.find((k) => k.id === id);
  if (!target) {
    logger.warn(`キーワードが見つかりません: ${id}`);
    return false;
  }

  if (updates.keyword !== undefined) target.keyword = updates.keyword;
  if (updates.description !== undefined) target.description = updates.description;
  if (updates.category !== undefined) target.category = updates.category;

  saveKeywords(data);
  logger.info(`キーワード更新: ${id}`);
  return true;
}

/** IDでキーワードを取得 */
export function getKeywordById(id) {
  const data = loadKeywords();
  return data.keywords.find((k) => k.id === id) || null;
}

/** 次の未投稿キーワードを取得 */
export function getNextKeyword() {
  const data = loadKeywords();
  const pending = data.keywords.find((k) => k.status === 'pending');
  if (!pending) {
    logger.warn('未投稿のキーワードがありません。キーワードを追加してください。');
    return null;
  }
  return pending;
}

/** キーワードを投稿済みに更新 */
export function markAsPosted(keyword, postUrl = '') {
  const data = loadKeywords();
  // keyword または description で一致するものを探す
  const target = data.keywords.find(
    (k) => (k.keyword === keyword || (!k.keyword && k.description)) && k.status !== 'posted'
  ) || data.keywords.find((k) => k.keyword === keyword);
  if (target) {
    target.status = 'posted';
    target.postedAt = new Date().toISOString();
    target.postUrl = postUrl;
    saveKeywords(data);
    logger.info(`投稿完了: "${keyword || target.description?.slice(0, 30)}"`);
  }
}

/** キーワードを失敗に更新 */
export function markAsFailed(keyword, reason = '') {
  const data = loadKeywords();
  const target = data.keywords.find(
    (k) => (k.keyword === keyword || (!k.keyword && k.description)) && k.status !== 'posted'
  ) || data.keywords.find((k) => k.keyword === keyword);
  if (target) {
    target.status = 'failed';
    target.failedAt = new Date().toISOString();
    target.failReason = reason;
    saveKeywords(data);
    logger.error(`投稿失敗: "${keyword || target.description?.slice(0, 30)}" - ${reason}`);
  }
}

/** キーワード一覧を取得 */
export function listKeywords() {
  const data = loadKeywords();
  return data.keywords;
}

/** キーワードを削除 */
export function deleteKeyword(id) {
  const data = loadKeywords();
  const before = data.keywords.length;
  data.keywords = data.keywords.filter((k) => k.id !== id);
  if (data.keywords.length === before) {
    logger.warn(`キーワードが見つかりません: ${id}`);
    return false;
  }
  saveKeywords(data);
  logger.info(`キーワード削除: ${id}`);
  return true;
}

/** 統計情報 */
export function getStats() {
  const data = loadKeywords();
  const total = data.keywords.length;
  const pending = data.keywords.filter((k) => k.status === 'pending').length;
  const posted = data.keywords.filter((k) => k.status === 'posted').length;
  const failed = data.keywords.filter((k) => k.status === 'failed').length;
  return { total, pending, posted, failed };
}
