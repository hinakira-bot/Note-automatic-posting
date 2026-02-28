import { createInterface } from 'readline';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

async function setup() {
  console.log('');
  console.log('============================================');
  console.log('  Note自動投稿ツール - セットアップ');
  console.log('============================================');
  console.log('');
  console.log('必要なAPIキーとアカウント情報を設定します。');
  console.log('');

  const envPath = resolve(ROOT, '.env');
  let existing = {};

  if (existsSync(envPath)) {
    console.log('⚠️  既存の .env が見つかりました。上書きしますか？');
    const overwrite = await ask('上書きする場合は y を入力: ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('セットアップを中断しました。');
      rl.close();
      return;
    }
    // 既存値を読み込み（デフォルト表示用）
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) existing[match[1].trim()] = match[2].trim();
    }
  }

  const def = (key, fallback = '') => existing[key] || fallback;
  const askWithDefault = async (question, key, fallback = '') => {
    const d = def(key, fallback);
    const suffix = d && !d.startsWith('your_') ? ` [${d}]` : '';
    const answer = await ask(`${question}${suffix}: `);
    return answer || d;
  };

  console.log('\n--- 1/3: Gemini API ---');
  console.log('Google AI Studio (https://aistudio.google.com/) で取得できます。\n');
  const geminiKey = await askWithDefault('Gemini APIキー', 'GEMINI_API_KEY');
  const textModel = await askWithDefault(
    'テキストモデル名',
    'GEMINI_TEXT_MODEL',
    'gemini-3-flash-preview'
  );
  const imageModel = await askWithDefault(
    '画像モデル名',
    'GEMINI_IMAGE_MODEL',
    'gemini-3.1-flash-image-preview'
  );

  console.log('\n--- 2/3: Note ---');
  console.log('note.com のログインメールアドレス・パスワードを設定します。\n');
  const noteEmail = await askWithDefault('Noteメールアドレス', 'NOTE_EMAIL');
  const notePass = await askWithDefault('Noteパスワード', 'NOTE_PASSWORD');

  console.log('\n--- 3/3: 投稿設定 ---\n');
  const cronSchedule = await askWithDefault(
    '毎日の投稿時刻 (cron形式)',
    'CRON_SCHEDULE',
    '0 9 * * *'
  );
  const minLen = await askWithDefault('記事の最小文字数', 'ARTICLE_MIN_LENGTH', '2000');
  const maxLen = await askWithDefault('記事の最大文字数', 'ARTICLE_MAX_LENGTH', '4000');

  // .env ファイル生成
  const envContent = `# Note自動投稿ツール 設定ファイル
# セットアップ日時: ${new Date().toLocaleString('ja-JP')}

# --- Gemini API ---
GEMINI_API_KEY=${geminiKey}
GEMINI_TEXT_MODEL=${textModel}
GEMINI_IMAGE_MODEL=${imageModel}

# --- Note ---
NOTE_EMAIL=${noteEmail}
NOTE_PASSWORD=${notePass}

# --- 投稿設定 ---
CRON_SCHEDULE=${cronSchedule}
POST_CATEGORY=
ARTICLE_MIN_LENGTH=${minLen}
ARTICLE_MAX_LENGTH=${maxLen}

# --- オプション ---
DRY_RUN=false
LOG_LEVEL=info
`;

  writeFileSync(envPath, envContent, 'utf-8');

  console.log('\n============================================');
  console.log('  ✅ セットアップ完了!');
  console.log('============================================');
  console.log('');
  console.log('次のステップ:');
  console.log('  1. キーワードを追加:');
  console.log('     node src/index.js add "副業 在宅ワーク 始め方"');
  console.log('');
  console.log('  2. 接続テスト:');
  console.log('     npm run test:gemini    (Gemini API)');
  console.log('     npm run test:search    (Google検索)');
  console.log('     npm run test:login     (Noteログイン)');
  console.log('');
  console.log('  3. ドライランで確認:');
  console.log('     npm run post:dry');
  console.log('');
  console.log('  4. 本番投稿:');
  console.log('     npm run post           (1回投稿)');
  console.log('     npm run start          (毎日自動投稿)');
  console.log('');

  rl.close();
}

setup().catch((err) => {
  console.error('セットアップエラー:', err.message);
  rl.close();
  process.exit(1);
});
