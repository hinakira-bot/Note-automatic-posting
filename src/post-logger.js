import { readFileSync, writeFileSync, existsSync } from 'fs';
import config from './config.js';

const LOG_PATH = config.paths.postLog;

function loadLog() {
  if (!existsSync(LOG_PATH)) {
    writeFileSync(LOG_PATH, JSON.stringify({ posts: [] }, null, 2), 'utf-8');
    return { posts: [] };
  }
  return JSON.parse(readFileSync(LOG_PATH, 'utf-8'));
}

/** 投稿ログを記録 */
export function logPost(entry) {
  const data = loadLog();
  data.posts.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  writeFileSync(LOG_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/** 投稿ログ一覧を取得 */
export function getPostLog() {
  return loadLog().posts;
}

/**
 * editor.note.com URLを公開URLに変換
 * editor.note.com/notes/nXXXX/edit/ → https://note.com/n/nXXXX
 */
function normalizeNoteUrl(url) {
  if (!url) return '';
  const editorMatch = url.match(/editor\.note\.com\/notes\/(n[a-f0-9]+)/);
  if (editorMatch) {
    return `https://note.com/n/${editorMatch[1]}`;
  }
  return url;
}

/**
 * 投稿済み記事のインデックスを返す（内部リンク用）
 * URLが存在し成功した投稿のみ
 */
export function getArticleIndex() {
  const posts = loadLog().posts;
  return posts
    .filter(p => p.url && !p.error && !p.dryRun)
    .map(p => ({
      keyword: p.keyword || '',
      title: p.title || '',
      url: normalizeNoteUrl(p.url),
    }))
    .filter(p => p.url); // URL正規化後に空でないもの
}

/**
 * 投稿済み記事インデックスをプロンプト用テキストに変換
 * 記事0件なら空文字列
 */
export function getArticleIndexForPrompt() {
  const articles = getArticleIndex();
  if (articles.length === 0) return '';
  return articles.map(a => `- 「${a.title}」: ${a.url}`).join('\n');
}
