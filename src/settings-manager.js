import { readFileSync, writeFileSync, existsSync } from 'fs';
import config from './config.js';
import logger from './logger.js';

const SETTINGS_PATH = config.paths.settings;

const DEFAULT_SETTINGS = {
  article: {
    minLength: 2000,
    maxLength: 4000,
    defaultCategory: '',
    targetAudience: '',
    defaultHashtags: '',
  },
  knowledge: {
    maxFileSizeKB: 100,
    maxTotalChars: 50000,
  },
  posting: {
    cronSchedule: '0 9 * * *',
    dryRun: false,
  },
};

/**
 * settings.json を読み込む（なければデフォルト返却）
 */
export function loadSettings() {
  if (!existsSync(SETTINGS_PATH)) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const data = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    // デフォルトとマージ（ユーザー値優先）
    return deepMerge(DEFAULT_SETTINGS, data);
  } catch (err) {
    logger.warn(`settings.json 読み込みエラー: ${err.message}`);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * ドットパスで設定値を取得
 * 例: getSetting('article.minLength', 2000)
 */
export function getSetting(path, defaultValue = undefined) {
  const settings = loadSettings();
  const keys = path.split('.');
  let current = settings;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return defaultValue;
    current = current[key];
  }
  return current !== undefined ? current : defaultValue;
}

/**
 * ドットパスで設定値を更新
 * 例: updateSetting('article.minLength', 3000)
 */
export function updateSetting(path, value) {
  const settings = loadSettings();
  const keys = path.split('.');
  let current = settings;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }

  const lastKey = keys[keys.length - 1];

  // 型の自動変換
  if (typeof value === 'string') {
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^\d+$/.test(value)) value = parseInt(value, 10);
  }

  current[lastKey] = value;
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  logger.info(`設定更新: ${path} = ${JSON.stringify(value)}`);
}

/**
 * settings.json を初期化（既存があれば上書きしない）
 */
export function initSettings() {
  if (!existsSync(SETTINGS_PATH)) {
    writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
    logger.info('settings.json を初期化しました');
  }
}

/**
 * ディープマージ（source の値で target を上書き）
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
