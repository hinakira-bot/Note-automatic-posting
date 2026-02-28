/**
 * クレデンシャル管理
 * .env ファイルの読み書き・マスク表示を管理する
 * APIキー・パスワードがブラウザに漏れないよう、サーバーサイド専用
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { resolve } from 'path';
import { PROJECT_ROOT } from '../config.js';

const ENV_PATH = resolve(PROJECT_ROOT, '.env');
const ENV_EXAMPLE_PATH = resolve(PROJECT_ROOT, '.env.example');

/** .envが存在するか */
export function envExists() {
  return existsSync(ENV_PATH);
}

/** 必須項目が設定済みか確認 */
export function isConfigured() {
  if (!envExists()) return false;

  const env = parseEnvFile();
  const geminiKey = env.GEMINI_API_KEY || '';
  const noteEmail = env.NOTE_EMAIL || '';
  const notePass = env.NOTE_PASSWORD || '';

  return (
    geminiKey.length > 0 &&
    !geminiKey.startsWith('your_') &&
    noteEmail.length > 0 &&
    !noteEmail.startsWith('your_') &&
    notePass.length > 0 &&
    !notePass.startsWith('your_')
  );
}

/**
 * .env ファイルをパースしてオブジェクトで返す
 */
function parseEnvFile() {
  if (!existsSync(ENV_PATH)) return {};

  const content = readFileSync(ENV_PATH, 'utf-8');
  const result = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

/**
 * マスクされたクレデンシャル情報を返す（ブラウザ向け）
 * 値は先頭4文字 + *** に変換、短い値は全て***
 */
export function getMaskedCredentials() {
  const env = parseEnvFile();

  const mask = (val) => {
    if (!val || val.startsWith('your_')) return '';
    if (val.length <= 6) return '***';
    return val.slice(0, 4) + '***' + val.slice(-2);
  };

  return {
    geminiApiKey: mask(env.GEMINI_API_KEY),
    geminiTextModel: env.GEMINI_TEXT_MODEL || 'gemini-3-flash-preview',
    geminiImageModel: env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview',
    noteEmail: mask(env.NOTE_EMAIL),
    notePassword: env.NOTE_PASSWORD ? '***設定済***' : '',
    isConfigured: isConfigured(),
  };
}

/**
 * クレデンシャルを保存（.envファイルに書き込み）
 * 空文字の項目は既存値を維持する
 */
export function saveCredentials(credentials) {
  // 既存の.envを読み込む（なければ.env.exampleから生成）
  let existingEnv = {};
  if (existsSync(ENV_PATH)) {
    existingEnv = parseEnvFile();
  } else if (existsSync(ENV_EXAMPLE_PATH)) {
    copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
    existingEnv = parseEnvFile();
  }

  // 更新マッピング
  const mapping = {
    geminiApiKey: 'GEMINI_API_KEY',
    geminiTextModel: 'GEMINI_TEXT_MODEL',
    geminiImageModel: 'GEMINI_IMAGE_MODEL',
    noteEmail: 'NOTE_EMAIL',
    notePassword: 'NOTE_PASSWORD',
  };

  for (const [field, envKey] of Object.entries(mapping)) {
    const newValue = credentials[field];
    // 空文字やundefinedの場合は既存値を維持
    if (newValue !== undefined && newValue !== '') {
      existingEnv[envKey] = newValue;
    }
  }

  // デフォルト値の確保
  const defaults = {
    GEMINI_TEXT_MODEL: 'gemini-3-flash-preview',
    GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image-preview',
    CRON_SCHEDULE: '0 9 * * *',
    POST_CATEGORY: '',
    ARTICLE_MIN_LENGTH: '2000',
    ARTICLE_MAX_LENGTH: '4000',
    DRY_RUN: 'false',
    LOG_LEVEL: 'info',
  };

  for (const [key, val] of Object.entries(defaults)) {
    if (!existingEnv[key]) existingEnv[key] = val;
  }

  // .envファイル生成
  const envContent = `# Note 自動投稿ツール 設定ファイル
# ※ Web UIのセットアップで自動生成されました

# --- Gemini API ---
GEMINI_API_KEY=${existingEnv.GEMINI_API_KEY || ''}
GEMINI_TEXT_MODEL=${existingEnv.GEMINI_TEXT_MODEL || 'gemini-3-flash-preview'}
GEMINI_IMAGE_MODEL=${existingEnv.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview'}

# --- Note ---
NOTE_EMAIL=${existingEnv.NOTE_EMAIL || ''}
NOTE_PASSWORD=${existingEnv.NOTE_PASSWORD || ''}

# --- 投稿設定 ---
CRON_SCHEDULE=${existingEnv.CRON_SCHEDULE || '0 9 * * *'}
POST_CATEGORY=${existingEnv.POST_CATEGORY || ''}
ARTICLE_MIN_LENGTH=${existingEnv.ARTICLE_MIN_LENGTH || '2000'}
ARTICLE_MAX_LENGTH=${existingEnv.ARTICLE_MAX_LENGTH || '4000'}

# --- オプション ---
DRY_RUN=${existingEnv.DRY_RUN || 'false'}
LOG_LEVEL=${existingEnv.LOG_LEVEL || 'info'}
`;

  writeFileSync(ENV_PATH, envContent, 'utf-8');

  // process.env も即時更新（サーバー再起動なしで反映）
  for (const [key, val] of Object.entries(existingEnv)) {
    process.env[key] = val;
  }

  return true;
}
