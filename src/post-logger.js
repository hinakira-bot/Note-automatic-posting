import { readFileSync, writeFileSync, existsSync } from 'fs';
import config from './config.js';
import { getSetting } from './settings-manager.js';

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
 * note.comユーザー名を取得
 * 1. 設定 note.username
 * 2. 投稿ログから公開URLを解析して自動取得
 */
function getNoteUsername() {
  // 設定から取得
  const settingUsername = getSetting('note.username', '');
  if (settingUsername) return settingUsername;

  // 投稿ログの公開URLからユーザー名を抽出
  const posts = loadLog().posts;
  for (const p of posts) {
    if (!p.url) continue;
    const match = p.url.match(/note\.com\/([^/]+)\/n\//);
    if (match && match[1] !== 'n') {
      return match[1];
    }
  }

  return '';
}

/**
 * editor.note.com URLを公開URLに変換
 * editor.note.com/notes/nXXXX/edit/ → https://note.com/USERNAME/n/nXXXX
 * 既に公開URL形式ならそのまま返す
 */
function normalizeNoteUrl(url) {
  if (!url) return '';

  // 既に公開URL形式（note.com/USERNAME/n/nXXXX）ならそのまま
  const publicMatch = url.match(/note\.com\/([^/]+)\/n\/(n[a-f0-9]+)/);
  if (publicMatch) {
    return `https://note.com/${publicMatch[1]}/n/${publicMatch[2]}`;
  }

  // editor URLからnote IDを抽出
  const editorMatch = url.match(/editor\.note\.com\/notes\/(n[a-f0-9]+)/);
  if (editorMatch) {
    const username = getNoteUsername();
    if (username) {
      return `https://note.com/${username}/n/${editorMatch[1]}`;
    }
    // ユーザー名不明の場合はeditor URLをそのまま返さない（リンク切れ防止）
    return '';
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
