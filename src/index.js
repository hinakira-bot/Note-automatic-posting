import { Command } from 'commander';
import cron from 'node-cron';
import config, { validateConfig } from './config.js';
import logger from './logger.js';
import {
  addKeyword,
  addKeywords,
  listKeywords,
  getStats,
  updateKeyword,
} from './keyword-manager.js';

// 遅延importする重いモジュール
async function getPipeline() {
  validateConfig();
  const { runPipeline } = await import('./pipeline.js');
  return runPipeline;
}
async function getTestLogin() {
  validateConfig();
  const { testLogin } = await import('./note-poster.js');
  return testLogin;
}
async function getAnalyzer() {
  validateConfig();
  const { analyzeCompetitors } = await import('./competitor-analyzer.js');
  return analyzeCompetitors;
}

const program = new Command();

program
  .name('note-auto-poster')
  .description('Note 自動投稿ツール - Gemini AI + SEO分析')
  .version('2.0.0');

// ============================================================
//  投稿系コマンド
// ============================================================

// === start: cronで毎日自動投稿 ===
program
  .command('start')
  .description('毎日自動投稿を開始（cronスケジュール）')
  .action(async () => {
    validateConfig();
    const schedule = config.posting.cronSchedule;
    logger.info(`自動投稿スケジューラーを開始します`);
    logger.info(`スケジュール: ${schedule}`);
    logger.info(`ドライラン: ${config.dryRun ? 'ON' : 'OFF'}`);

    const stats = getStats();
    logger.info(
      `キーワード: 全${stats.total}件 (未投稿: ${stats.pending}, 投稿済: ${stats.posted}, 失敗: ${stats.failed})`
    );

    if (stats.pending === 0) {
      logger.warn('未投稿キーワードがありません。先にキーワードを追加してください。');
      logger.info('追加方法: node src/index.js add "キーワード" -d "説明"');
      return;
    }

    if (!cron.validate(schedule)) {
      logger.error(`無効なcronスケジュール: ${schedule}`);
      process.exit(1);
    }

    cron.schedule(schedule, async () => {
      logger.info('--- スケジュール実行 ---');
      const runPipeline = await getPipeline();
      await runPipeline();
    });

    logger.info('スケジューラーが稼働中です。Ctrl+C で終了します。');

    // 即時実行オプション
    if (process.argv.includes('--now')) {
      logger.info('--now オプション: 即時実行します');
      const runPipeline = await getPipeline();
      runPipeline();
    }
  });

// === post: 1回だけ投稿 ===
program
  .command('post')
  .description('1回だけ投稿を実行')
  .option('--dry-run', '投稿せずに生成結果を確認')
  .action(async (opts) => {
    const runPipeline = await getPipeline();
    const result = await runPipeline({ dryRun: opts.dryRun });
    if (result.success) {
      console.log(`\n✅ 投稿${result.dryRun ? '(ドライラン)' : ''}完了: ${result.title}`);
    } else {
      console.log(`\n❌ 投稿失敗: ${result.error || result.reason}`);
    }
    process.exit(result.success ? 0 : 1);
  });

// ============================================================
//  キーワード管理コマンド
// ============================================================

// === add: キーワード追加（説明付き） ===
program
  .command('add')
  .description('キーワードを追加（説明付きも可能）')
  .argument('<keyword>', 'キーワード（空文字 "" で説明のみモード）')
  .option('-d, --description <text>', '記事内容の説明')
  .option('-c, --category <category>', 'カテゴリ')
  .action((keyword, opts) => {
    addKeyword(keyword, opts.category || '', opts.description || '');
    const stats = getStats();
    console.log(`\n📊 キーワード: 全${stats.total}件 (未投稿: ${stats.pending})`);
  });

// === add-file: ファイルからキーワードを一括追加 ===
program
  .command('add-file')
  .description('テキストファイルからキーワードを一括追加')
  .argument('<file>', 'キーワードファイルのパス（1行1キーワード、| で説明追加可）')
  .action(async (file) => {
    const { readFileSync } = await import('fs');
    const content = readFileSync(file, 'utf-8');
    const keywords = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        // "キーワード | 説明" 形式に対応
        if (line.includes('|')) {
          const [kw, desc] = line.split('|').map((s) => s.trim());
          return { keyword: kw, description: desc || '' };
        }
        return { keyword: line };
      });

    const added = addKeywords(keywords);
    console.log(`\n✅ ${added}件のキーワードを追加しました`);
    const stats = getStats();
    console.log(`📊 キーワード: 全${stats.total}件 (未投稿: ${stats.pending})`);
  });

// === edit: キーワード編集 ===
program
  .command('edit')
  .description('登録済みキーワードの説明やカテゴリを編集')
  .argument('<id>', 'キーワードID')
  .option('-k, --keyword <keyword>', 'キーワードを変更')
  .option('-d, --description <text>', '説明を変更')
  .option('-c, --category <category>', 'カテゴリを変更')
  .action((id, opts) => {
    const updates = {};
    if (opts.keyword !== undefined) updates.keyword = opts.keyword;
    if (opts.description !== undefined) updates.description = opts.description;
    if (opts.category !== undefined) updates.category = opts.category;

    if (Object.keys(updates).length === 0) {
      console.log('変更するオプションを指定してください (-k, -d, -c)');
      return;
    }

    const result = updateKeyword(id, updates);
    if (result) {
      console.log('✅ キーワードを更新しました');
    } else {
      console.log('❌ キーワードが見つかりません');
    }
  });

// === list: キーワード一覧 ===
program
  .command('list')
  .description('キーワード一覧を表示')
  .option('-s, --status <status>', 'ステータスでフィルタ (pending/posted/failed)')
  .action((opts) => {
    let keywords = listKeywords();
    if (opts.status) {
      keywords = keywords.filter((k) => k.status === opts.status);
    }

    if (keywords.length === 0) {
      console.log('\nキーワードが登録されていません。');
      console.log('追加方法: node src/index.js add "キーワード" -d "説明"');
      return;
    }

    console.log(`\n📋 キーワード一覧 (${keywords.length}件)\n`);
    console.log('状態     | ID               | キーワード              | 説明                 | 投稿日');
    console.log('-'.repeat(100));
    for (const kw of keywords) {
      const status =
        kw.status === 'posted' ? '✅ 済  ' : kw.status === 'failed' ? '❌ 失敗' : '⏳ 待機';
      const id = (kw.id || '').slice(0, 16);
      const keyword = (kw.keyword || '').padEnd(20).slice(0, 20);
      const desc = (kw.description || '-').slice(0, 18).padEnd(18);
      const date = kw.postedAt
        ? new Date(kw.postedAt).toLocaleDateString('ja-JP')
        : '-';
      console.log(`${status} | ${id.padEnd(16)} | ${keyword} | ${desc} | ${date}`);
    }

    const stats = getStats();
    console.log(
      `\n📊 合計: ${stats.total} | 未投稿: ${stats.pending} | 投稿済: ${stats.posted} | 失敗: ${stats.failed}`
    );
  });

// ============================================================
//  ナレッジ管理コマンド
// ============================================================

program
  .command('knowledge-add')
  .description('ナレッジファイルを追加 (.txt, .pdf)')
  .argument('<file>', 'ファイルパス')
  .action(async (file) => {
    const { addKnowledgeFile } = await import('./knowledge-manager.js');
    try {
      const result = addKnowledgeFile(file);
      console.log(`\n✅ ナレッジ追加: ${result.filename} (${result.sizeKB}KB)`);
    } catch (err) {
      console.log(`\n❌ エラー: ${err.message}`);
    }
  });

program
  .command('knowledge-list')
  .description('ナレッジファイル一覧')
  .action(async () => {
    const { listKnowledgeFiles } = await import('./knowledge-manager.js');
    const files = listKnowledgeFiles();
    if (files.length === 0) {
      console.log('\nナレッジファイルが登録されていません。');
      console.log('追加方法: node src/index.js knowledge-add ファイルパス');
      return;
    }
    console.log(`\n📚 ナレッジ一覧 (${files.length}件)\n`);
    console.log('ファイル名                     | 形式  | サイズ');
    console.log('-'.repeat(60));
    for (const f of files) {
      console.log(`${f.filename.padEnd(30)} | ${f.format.padEnd(5)} | ${f.sizeKB}KB`);
    }
  });

program
  .command('knowledge-remove')
  .description('ナレッジファイルを削除')
  .argument('<filename>', 'ファイル名')
  .action(async (filename) => {
    const { removeKnowledgeFile } = await import('./knowledge-manager.js');
    try {
      removeKnowledgeFile(filename);
      console.log(`\n✅ ナレッジ削除: ${filename}`);
    } catch (err) {
      console.log(`\n❌ エラー: ${err.message}`);
    }
  });

program
  .command('knowledge-show')
  .description('ナレッジファイルの内容を表示')
  .argument('<filename>', 'ファイル名')
  .action(async (filename) => {
    const { loadKnowledgeFile } = await import('./knowledge-manager.js');
    try {
      const content = await loadKnowledgeFile(filename);
      console.log(`\n--- ${filename} ---`);
      console.log(content.slice(0, 3000));
      if (content.length > 3000) {
        console.log(`\n... (${content.length}文字中 3000文字まで表示)`);
      }
    } catch (err) {
      console.log(`\n❌ エラー: ${err.message}`);
    }
  });

// ============================================================
//  プロンプト管理コマンド
// ============================================================

program
  .command('prompt-list')
  .description('プロンプトテンプレート一覧')
  .action(async () => {
    const { listPrompts } = await import('./prompt-manager.js');
    const prompts = listPrompts();
    console.log(`\n📝 プロンプトテンプレート一覧\n`);
    console.log('テンプレート名                   | 状態');
    console.log('-'.repeat(55));
    for (const p of prompts) {
      const statusLabel = p.status === 'customized' ? '🔧 カスタム'
        : p.status === 'default' ? '📋 デフォルト'
        : '❌ 未設定';
      console.log(`${p.name.padEnd(32)} | ${statusLabel}`);
    }
    console.log('\n編集: node src/index.js prompt-edit <テンプレート名>');
  });

program
  .command('prompt-show')
  .description('プロンプトテンプレートの内容を表示')
  .argument('<name>', 'テンプレート名')
  .action(async (name) => {
    const { loadPrompt } = await import('./prompt-manager.js');
    try {
      const content = loadPrompt(name);
      console.log(`\n--- ${name} ---\n`);
      console.log(content);
    } catch (err) {
      console.log(`\n❌ エラー: ${err.message}`);
    }
  });

program
  .command('prompt-edit')
  .description('プロンプトテンプレートをエディタで開く')
  .argument('<name>', 'テンプレート名')
  .action(async (name) => {
    const { existsSync, copyFileSync } = await import('fs');
    const { resolve } = await import('path');
    const { exec } = await import('child_process');

    const userPath = resolve(config.paths.prompts, `${name}.md`);
    const defaultPath = resolve(config.paths.promptDefaults, `${name}.md`);

    // ユーザー版がなければデフォルトからコピー
    if (!existsSync(userPath) && existsSync(defaultPath)) {
      copyFileSync(defaultPath, userPath);
    }

    if (!existsSync(userPath)) {
      console.log(`\n❌ テンプレートが見つかりません: ${name}`);
      return;
    }

    console.log(`\n📝 エディタで開いています: ${userPath}`);
    // Windowsの場合 notepad、それ以外は $EDITOR or vi
    const isWin = process.platform === 'win32';
    const editor = isWin ? 'notepad' : (process.env.EDITOR || 'vi');
    exec(`${editor} "${userPath}"`);
  });

program
  .command('prompt-reset')
  .description('プロンプトテンプレートをデフォルトに戻す')
  .argument('<name>', 'テンプレート名')
  .action(async (name) => {
    const { resetPrompt } = await import('./prompt-manager.js');
    try {
      resetPrompt(name);
      console.log(`\n✅ デフォルトに戻しました: ${name}`);
    } catch (err) {
      console.log(`\n❌ エラー: ${err.message}`);
    }
  });

program
  .command('prompt-reset-all')
  .description('全プロンプトテンプレートをデフォルトに戻す')
  .action(async () => {
    const { getTemplateNames, resetPrompt } = await import('./prompt-manager.js');
    for (const name of getTemplateNames()) {
      try {
        resetPrompt(name);
        console.log(`  ✅ ${name}`);
      } catch { /* skip */ }
    }
    console.log('\n全テンプレートをデフォルトに戻しました');
  });

// ============================================================
//  設定管理コマンド
// ============================================================

program
  .command('config-show')
  .description('現在の設定を表示')
  .action(async () => {
    const { loadSettings } = await import('./settings-manager.js');
    const settings = loadSettings();
    console.log('\n⚙️  設定一覧\n');
    printSettings(settings, '');
  });

program
  .command('config-set')
  .description('設定を変更')
  .argument('<key>', '設定キー (例: article.minLength)')
  .argument('<value>', '設定値')
  .action(async (key, value) => {
    const { updateSetting } = await import('./settings-manager.js');
    updateSetting(key, value);
    console.log(`\n✅ 設定更新: ${key} = ${value}`);
  });

function printSettings(obj, prefix) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      printSettings(value, path);
    } else {
      console.log(`  ${path.padEnd(30)} = ${JSON.stringify(value)}`);
    }
  }
}

// ============================================================
//  テストコマンド
// ============================================================

// === test-gemini: Gemini API接続テスト ===
program
  .command('test-gemini')
  .description('Gemini API接続をテスト')
  .action(async () => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    validateConfig();
    const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

    console.log('\n🔍 Gemini API テスト中...\n');

    // テキストモデル
    try {
      const model = genAI.getGenerativeModel({ model: config.gemini.textModel });
      const result = await model.generateContent('こんにちは。テスト応答を1文で返してください。');
      console.log(`✅ テキストモデル (${config.gemini.textModel}): ${result.response.text().trim()}`);
    } catch (err) {
      console.log(`❌ テキストモデル (${config.gemini.textModel}): ${err.message}`);
    }

    // 画像モデル
    try {
      const model = genAI.getGenerativeModel({ model: config.gemini.imageModel });
      console.log(`✅ 画像モデル (${config.gemini.imageModel}): 接続OK`);
    } catch (err) {
      console.log(`❌ 画像モデル (${config.gemini.imageModel}): ${err.message}`);
    }
  });

// === test-search: Google検索テスト ===
program
  .command('test-search')
  .description('Gemini Google Search で競合分析をテスト')
  .argument('[keyword]', 'テスト検索キーワード', 'ブログ 書き方')
  .action(async (keyword) => {
    console.log(`\n🔍 Google検索テスト: "${keyword}"\n`);
    try {
      const analyzeCompetitors = await getAnalyzer();
      const result = await analyzeCompetitors(keyword);
      console.log(`✅ 検索結果: ${result.searchResults.length}件`);
      for (const r of result.searchResults.slice(0, 5)) {
        console.log(`  - ${r.title}`);
      }
      console.log(`\n📊 分析: 平均文字数=${result.summary.avgCharCount}, 平均h2数=${result.summary.commonH2Count}`);
    } catch (err) {
      console.log(`❌ エラー: ${err.message}`);
    }
  });

// === test-login: Noteログインテスト ===
program
  .command('test-login')
  .description('note.com へのログインをテスト（ブラウザが開きます）')
  .action(async () => {
    console.log('\n🔍 Note ログインテスト中...\n');
    const testLogin = await getTestLogin();
    const result = await testLogin();
    if (result) {
      console.log('✅ ログイン成功');
    } else {
      console.log('❌ ログイン失敗 - .env の NOTE_EMAIL / NOTE_PASSWORD を確認してください');
    }
    process.exit(result ? 0 : 1);
  });

program.parse();
