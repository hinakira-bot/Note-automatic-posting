import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'fs';
import { resolve, basename } from 'path';
import config from './config.js';
import logger from './logger.js';

const PROMPTS_DIR = config.paths.prompts;
const DEFAULTS_DIR = config.paths.promptDefaults;

const TEMPLATE_NAMES = [
  'article-search-intent',
  'article-outline',
  'article-title',
  'article-body',
  'image-eyecatch',
  'image-diagram',
];

/**
 * プロンプトテンプレートを読み込む
 * ユーザー版があればそれを、なければデフォルトを返す
 */
export function loadPrompt(name) {
  const userPath = resolve(PROMPTS_DIR, `${name}.md`);
  const defaultPath = resolve(DEFAULTS_DIR, `${name}.md`);

  if (existsSync(userPath)) {
    return readFileSync(userPath, 'utf-8');
  }
  if (existsSync(defaultPath)) {
    return readFileSync(defaultPath, 'utf-8');
  }

  logger.error(`プロンプトテンプレートが見つかりません: ${name}`);
  throw new Error(`Prompt template not found: ${name}`);
}

/**
 * テンプレートに変数を埋め込む
 * {{変数名}} → 値に置換
 * {{#if 変数名}}...{{/if}} → 値があればブロック表示、なければ削除
 */
export function renderPrompt(template, variables = {}) {
  let result = template;

  // 条件ブロック: {{#if varName}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, varName, content) => {
      const val = variables[varName];
      return val && String(val).trim() ? content : '';
    }
  );

  // 変数置換: {{varName}}
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value ?? '');
  }

  // 未置換の変数を除去
  result = result.replace(/\{\{[a-zA-Z_]+\}\}/g, '');

  // 連続空行を整理
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/**
 * プロンプトテンプレートをデフォルトに戻す
 */
export function resetPrompt(name) {
  const defaultPath = resolve(DEFAULTS_DIR, `${name}.md`);
  const userPath = resolve(PROMPTS_DIR, `${name}.md`);

  if (!existsSync(defaultPath)) {
    throw new Error(`デフォルトテンプレートが見つかりません: ${name}`);
  }

  copyFileSync(defaultPath, userPath);
  logger.info(`プロンプトをリセット: ${name}`);
}

/**
 * 全テンプレートの一覧と状態を返す
 */
export function listPrompts() {
  return TEMPLATE_NAMES.map((name) => {
    const userPath = resolve(PROMPTS_DIR, `${name}.md`);
    const defaultPath = resolve(DEFAULTS_DIR, `${name}.md`);
    const hasUser = existsSync(userPath);
    const hasDefault = existsSync(defaultPath);

    let status = 'missing';
    if (hasUser && hasDefault) {
      const userContent = readFileSync(userPath, 'utf-8');
      const defaultContent = readFileSync(defaultPath, 'utf-8');
      status = userContent === defaultContent ? 'default' : 'customized';
    } else if (hasDefault) {
      status = 'default';
    }

    return { name, status, path: hasUser ? userPath : defaultPath };
  });
}

/**
 * デフォルトテンプレートを初期化（セットアップ時に呼ばれる）
 * defaults/ からユーザー用 prompts/ にコピー（既存は上書きしない）
 */
export function initDefaultPrompts() {
  for (const name of TEMPLATE_NAMES) {
    const defaultPath = resolve(DEFAULTS_DIR, `${name}.md`);
    const userPath = resolve(PROMPTS_DIR, `${name}.md`);

    if (existsSync(defaultPath) && !existsSync(userPath)) {
      copyFileSync(defaultPath, userPath);
      logger.info(`プロンプト初期化: ${name}`);
    }
  }
}

/**
 * プロンプトテンプレートを保存（Web UI用）
 */
export function savePrompt(name, content) {
  if (!TEMPLATE_NAMES.includes(name)) {
    throw new Error(`無効なテンプレート名: ${name}`);
  }
  const userPath = resolve(PROMPTS_DIR, `${name}.md`);
  writeFileSync(userPath, content, 'utf-8');
  logger.info(`プロンプト保存: ${name}`);
}

/**
 * 利用可能なテンプレート名一覧
 */
export function getTemplateNames() {
  return [...TEMPLATE_NAMES];
}
