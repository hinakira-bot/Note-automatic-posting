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
