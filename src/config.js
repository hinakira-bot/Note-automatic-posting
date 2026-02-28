import 'dotenv/config';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, '..');

const envPath = resolve(PROJECT_ROOT, '.env');
const envExists = existsSync(envPath);

function getEnv(key, fallback = '') {
  return process.env[key] || fallback;
}

/** 設定が必要なコマンド実行前に呼ぶバリデーション */
export function validateConfig() {
  if (!envExists) {
    console.error('❌ .env ファイルが見つかりません。');
    console.error('   npm run setup を実行するか、.env.example をコピーして設定してください。');
    process.exit(1);
  }

  const required = [
    ['GEMINI_API_KEY', 'Gemini APIキー'],
    ['NOTE_EMAIL', 'Note メールアドレス'],
    ['NOTE_PASSWORD', 'Note パスワード'],
  ];

  for (const [key, label] of required) {
    const val = process.env[key];
    if (!val || val.startsWith('your_')) {
      console.error(`❌ ${label} が未設定です。.env の ${key} を設定してください。`);
      process.exit(1);
    }
  }
}

const config = {
  gemini: {
    apiKey: getEnv('GEMINI_API_KEY'),
    textModel: getEnv('GEMINI_TEXT_MODEL', 'gemini-3-flash-preview'),
    imageModel: getEnv('GEMINI_IMAGE_MODEL', 'gemini-2.0-flash-preview-image-generation'),
  },
  note: {
    email: getEnv('NOTE_EMAIL'),
    password: getEnv('NOTE_PASSWORD'),
  },
  posting: {
    cronSchedule: getEnv('CRON_SCHEDULE', '0 9 * * *'),
    category: getEnv('POST_CATEGORY', ''),
    minLength: parseInt(getEnv('ARTICLE_MIN_LENGTH', '2000'), 10),
    maxLength: parseInt(getEnv('ARTICLE_MAX_LENGTH', '4000'), 10),
  },
  dryRun: getEnv('DRY_RUN') === 'true',
  logLevel: getEnv('LOG_LEVEL', 'info'),
  paths: {
    root: PROJECT_ROOT,
    data: resolve(PROJECT_ROOT, 'data'),
    images: resolve(PROJECT_ROOT, 'images'),
    logs: resolve(PROJECT_ROOT, 'logs'),
    session: resolve(PROJECT_ROOT, 'data', 'session'),
    keywords: resolve(PROJECT_ROOT, 'data', 'keywords.json'),
    postLog: resolve(PROJECT_ROOT, 'data', 'post-log.json'),
    settings: resolve(PROJECT_ROOT, 'data', 'settings.json'),
    knowledge: resolve(PROJECT_ROOT, 'knowledge'),
    prompts: resolve(PROJECT_ROOT, 'prompts'),
    promptDefaults: resolve(PROJECT_ROOT, 'prompts', 'defaults'),
  },
};

export default config;
