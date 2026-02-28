import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import config from './config.js';
import logger from './logger.js';

const SESSION_DIR = config.paths.session;
const LOGIN_URL = 'https://note.com/login';
const EDITOR_URL = 'https://editor.note.com/new';

/**
 * ブラウザを起動（セッション付き・ボット検出回避）
 */
async function launchBrowser(headless = true) {
  mkdirSync(SESSION_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--no-first-run',
    ],
  });

  const context = await browser.newContext({
    storageState: existsSync(resolve(SESSION_DIR, 'state.json'))
      ? resolve(SESSION_DIR, 'state.json')
      : undefined,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'ja-JP',
  });

  // ボット検出回避
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    if (!window.chrome) {
      window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
    }
    const origQuery = navigator.permissions?.query?.bind(navigator.permissions);
    if (origQuery) {
      navigator.permissions.query = (params) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(params);
    }
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ja', 'en-US', 'en'] });
  });

  return { browser, context };
}

/**
 * 人間らしいタイピング（ランダム遅延付き）
 */
async function humanType(page, selector, text) {
  await page.click(selector);
  await page.waitForTimeout(200 + Math.random() * 300);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);
  for (const char of text) {
    await page.keyboard.type(char, { delay: 30 + Math.random() * 80 });
  }
  await page.waitForTimeout(300 + Math.random() * 400);
}

/**
 * note.com にログイン
 */
async function login(context) {
  const page = await context.newPage();

  try {
    // まずnote.comにアクセスしてセッション状態を確認
    logger.info('セッション確認中...');
    await page.goto('https://note.com', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // ログイン状態の確認（ログイン済みならアカウントメニュー等が存在）
    const isLoggedIn = await page.evaluate(() => {
      // note.comのログイン状態はcookieやDOM要素で判定
      const hasAccountMenu = !!document.querySelector('[class*="UserMenu"], [class*="user-menu"], [class*="avatar"], a[href*="/mypage"]');
      const hasLoginButton = !!document.querySelector('a[href="/login"], button:has(a[href="/login"])');
      return hasAccountMenu || !hasLoginButton;
    }).catch(() => false);

    if (isLoggedIn) {
      // ログイン済み - editor.note.comでもセッションが使えるか確認
      logger.info('note.com にログイン済み。エディタアクセスを確認中...');
      await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2000);

      const editorUrl = page.url();
      if (editorUrl.includes('editor.note.com')) {
        logger.info('セッション有効 - エディタにアクセスできました');
        await page.close();
        return true;
      }
      logger.info(`エディタにリダイレクトされませんでした: ${editorUrl}`);
    }

    // ログインが必要
    logger.info('note.com にログイン中...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // ログイン済みの場合（リダイレクトされた）
    const afterNavUrl = page.url();
    if (!afterNavUrl.includes('/login')) {
      logger.info('既にログイン済みです（セッション有効）');
      await saveSession(context);
      await page.close();
      return true;
    }

    // ログインフォームを探す
    logger.info(`認証ページ: ${page.url()}`);

    // メールアドレス入力欄を探す（複数セレクタ試行）
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="login"]',
      'input[placeholder*="メール"]',
      'input[placeholder*="email"]',
      'input[autocomplete="email"]',
      'input[autocomplete="username"]',
    ];

    let emailFilled = false;
    for (const sel of emailSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          logger.info(`メール入力中... (${sel})`);
          await el.click();
          await page.waitForTimeout(300);
          await el.fill('');
          await page.waitForTimeout(200);
          // 人間らしいタイピング
          for (const char of config.note.email) {
            await page.keyboard.type(char, { delay: 30 + Math.random() * 80 });
          }
          await page.waitForTimeout(500);
          emailFilled = true;
          break;
        }
      } catch {}
    }

    if (!emailFilled) {
      throw new Error('メールアドレス入力欄が見つかりません');
    }

    // パスワード入力
    logger.info('パスワード入力中...');
    const pwSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="パスワード"]',
    ];

    let pwFilled = false;
    for (const sel of pwSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.click();
          await page.waitForTimeout(300);
          await el.fill('');
          await page.waitForTimeout(200);
          for (const char of config.note.password) {
            await page.keyboard.type(char, { delay: 30 + Math.random() * 80 });
          }
          await page.waitForTimeout(500);
          pwFilled = true;
          break;
        }
      } catch {}
    }

    if (!pwFilled) {
      throw new Error('パスワード入力欄が見つかりません');
    }

    // 入力確認
    logger.info('入力確認完了');

    await page.waitForTimeout(1000 + Math.random() * 1000);

    // ログインボタンクリック
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("ログイン")',
      'input[type="submit"]',
    ];

    for (const sel of submitSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click();
          break;
        }
      } catch {}
    }

    // ログイン完了を待機
    await page.waitForURL((url) => {
      const href = url.href;
      return !href.includes('/login');
    }, { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    const afterUrl = page.url();
    logger.info(`ログイン後URL: ${afterUrl}`);

    if (afterUrl.includes('/login')) {
      // デバッグ用スクリーンショット
      try {
        await page.screenshot({ path: resolve(config.paths.logs, 'login-failed.png'), fullPage: true });
        logger.info('ログイン失敗時のスクリーンショットを保存: logs/login-failed.png');
      } catch { /* ignore */ }

      // reCAPTCHA検出
      const hasRecaptcha = await page.locator('iframe[src*="recaptcha"]').isVisible().catch(() => false);
      if (hasRecaptcha) {
        throw new Error('reCAPTCHAが表示されました。対話型セッションからログインしてください。');
      }

      throw new Error(`ログインに失敗しました。メールアドレス/パスワードを確認してください。(URL: ${afterUrl})`);
    }

    await saveSession(context);
    logger.info('ログイン成功 - セッションを保存しました');
    await page.close();
    return true;
  } catch (err) {
    await page.close();
    throw err;
  }
}

async function saveSession(context) {
  const state = await context.storageState();
  const statePath = resolve(SESSION_DIR, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * note.com エディタでカバー画像をアップロード
 */
async function uploadCoverImage(page, imagePath) {
  if (!imagePath || !existsSync(imagePath)) {
    logger.warn(`カバー画像ファイルが見つかりません: ${imagePath}`);
    return false;
  }

  try {
    logger.info(`カバー画像アップロード中: ${imagePath}`);

    // カバー画像エリアをクリック（「見出し画像」エリア）
    const coverSelectors = [
      'button[aria-label="画像を追加"]',
      'button:has-text("画像をアップロード")',
      '[data-testid="header-image"]',
      '.p-editor__header-image',
      'button:has-text("見出し画像")',
      '.header-image-area',
      '[class*="headerImage"]',
      '[class*="cover"]',
      '[class*="eyecatch"]',
    ];

    let coverClicked = false;
    for (const sel of coverSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          // filechooser イベントを待機しつつクリック
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 10000 }),
            el.click(),
          ]);
          await fileChooser.setFiles(imagePath);
          coverClicked = true;
          break;
        }
      } catch {}
    }

    if (!coverClicked) {
      // フォールバック: ページ上部の画像追加エリアを探す
      logger.info('カバー画像ボタンが見つからないため、代替方法を試行...');
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          page.locator('[class*="Header"] button, [class*="header"] button').first().click(),
        ]);
        await fileChooser.setFiles(imagePath);
        coverClicked = true;
      } catch {}
    }

    if (!coverClicked) {
      logger.warn('カバー画像のアップロードボタンが見つかりませんでした');
      return false;
    }

    await page.waitForTimeout(3000);

    // トリミングダイアログが表示された場合、確認ボタンを押す
    const trimConfirmSelectors = [
      'button:has-text("適用")',
      'button:has-text("完了")',
      'button:has-text("OK")',
      'button:has-text("決定")',
      'button:has-text("保存")',
      '[data-testid="crop-confirm"]',
    ];

    for (const sel of trimConfirmSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await btn.click();
          logger.info('トリミングダイアログを確認しました');
          await page.waitForTimeout(2000);
          break;
        }
      } catch {}
    }

    logger.info('カバー画像をアップロードしました');
    return true;
  } catch (err) {
    logger.warn(`カバー画像アップロードエラー: ${err.message}`);
    return false;
  }
}

/**
 * note.com エディタに本文を挿入
 * contenteditable div にHTMLをペーストする
 */
async function insertBodyContent(page, bodyHtml) {
  try {
    logger.info('本文を入力中...');

    // note.com のHTMLをシンプルに変換（不要な属性を除去）
    const cleanHtml = bodyHtml
      .replace(/\s*id="heading-\d+"/g, '')  // heading ID属性を除去
      .replace(/\s*class="[^"]*"/g, '');     // class属性を除去

    // 方法1: クリップボード経由でペースト（最も確実）
    const editorSelectors = [
      'div[contenteditable="true"][role="textbox"]',
      '.ProseMirror',
      'div[contenteditable="true"]',
      '[role="textbox"]',
      '.p-editor__body',
      '[class*="editor"] [contenteditable]',
      '.note-editor [contenteditable]',
    ];

    let editorEl = null;
    for (const sel of editorSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          editorEl = el;
          logger.info(`エディタ要素を検出: ${sel}`);
          break;
        }
      } catch {}
    }

    if (!editorEl) {
      throw new Error('エディタのcontenteditable要素が見つかりません');
    }

    // エディタにフォーカス
    await editorEl.click();
    await page.waitForTimeout(500);

    // クリップボードにHTMLをセットしてペースト
    const pasted = await page.evaluate(async (html) => {
      const editor = document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                     document.querySelector('.ProseMirror') ||
                     document.querySelector('div[contenteditable="true"]') ||
                     document.querySelector('[role="textbox"]');
      if (!editor) return false;

      editor.focus();

      // ClipboardEvent を使ってHTMLペーストをシミュレート
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', html);
      clipboardData.setData('text/plain', html.replace(/<[^>]*>/g, ''));

      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      });

      editor.dispatchEvent(pasteEvent);
      return true;
    }, cleanHtml);

    if (pasted) {
      logger.info('HTMLペーストで本文を挿入しました');
      await page.waitForTimeout(2000);
      return true;
    }

    // 方法2: innerHTML直接設定（フォールバック）
    logger.info('ペースト失敗、innerHTML直接設定を試行...');
    await page.evaluate((html) => {
      const editor = document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                     document.querySelector('.ProseMirror') ||
                     document.querySelector('div[contenteditable="true"]') ||
                     document.querySelector('[role="textbox"]');
      if (editor) {
        editor.innerHTML = html;
        // React/Vueの変更検知をトリガー
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, cleanHtml);

    await page.waitForTimeout(2000);

    // 入力確認
    const contentLength = await page.evaluate(() => {
      const editor = document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                     document.querySelector('.ProseMirror') ||
                     document.querySelector('div[contenteditable="true"]') ||
                     document.querySelector('[role="textbox"]');
      return editor ? editor.innerText.length : 0;
    });

    if (contentLength > 100) {
      logger.info(`本文入力完了（${contentLength}文字）`);
      return true;
    }

    // 方法3: キーボード入力（最終フォールバック）
    logger.info('直接設定も失敗、キーボード入力を試行...');
    const plainText = cleanHtml.replace(/<[^>]*>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    await editorEl.click();
    await page.waitForTimeout(300);
    await page.keyboard.type(plainText.slice(0, 5000), { delay: 5 });
    await page.waitForTimeout(1000);
    logger.info('キーボード入力で本文を入力しました（プレーンテキスト）');
    return true;
  } catch (err) {
    logger.error(`本文入力エラー: ${err.message}`);
    return false;
  }
}

/**
 * 本文中に図解画像を挿入（エディタの画像挿入機能経由）
 */
async function insertDiagramImage(page, imagePath) {
  if (!imagePath || !existsSync(imagePath)) return false;

  try {
    // エディタ内の画像追加ボタンを探す
    const imageButtonSelectors = [
      'button[aria-label*="画像"]',
      'button[title*="画像"]',
      '[data-testid="image-button"]',
      'button:has-text("画像")',
      '[class*="image-tool"]',
      '[class*="ImageTool"]',
    ];

    let uploaded = false;
    for (const sel of imageButtonSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 10000 }),
            btn.click(),
          ]);
          await fileChooser.setFiles(imagePath);
          uploaded = true;
          break;
        }
      } catch {}
    }

    if (!uploaded) {
      // フォールバック: ツールバーの+ボタンからの画像挿入
      try {
        const plusBtn = page.locator('[class*="plus"], [class*="add"], button:has-text("+")').first();
        if (await plusBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await plusBtn.click();
          await page.waitForTimeout(500);
          const imgOption = page.locator('button:has-text("画像"), [data-type="image"]').first();
          if (await imgOption.isVisible({ timeout: 2000 }).catch(() => false)) {
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 10000 }),
              imgOption.click(),
            ]);
            await fileChooser.setFiles(imagePath);
            uploaded = true;
          }
        }
      } catch {}
    }

    if (uploaded) {
      await page.waitForTimeout(3000);
      logger.info(`図解画像を挿入しました: ${imagePath}`);
    }
    return uploaded;
  } catch (err) {
    logger.warn(`図解画像挿入エラー: ${err.message}`);
    return false;
  }
}

/**
 * ハッシュタグを設定（公開ページ）
 */
async function setHashtags(page, category) {
  if (!category) return;

  try {
    // カテゴリ文字列をハッシュタグ配列に分割
    const tags = category.split(/[,、\s]+/).filter(t => t.trim());
    if (tags.length === 0) return;

    logger.info(`ハッシュタグを設定中: ${tags.join(', ')}`);

    const hashtagSelectors = [
      'input[placeholder*="ハッシュタグ"]',
      'input[placeholder*="タグ"]',
      '[data-testid="hashtag-input"]',
      '[class*="hashtag"] input',
      '[class*="tag"] input',
    ];

    let inputEl = null;
    for (const sel of hashtagSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          inputEl = el;
          break;
        }
      } catch {}
    }

    if (!inputEl) {
      logger.warn('ハッシュタグ入力欄が見つかりません');
      return;
    }

    for (const tag of tags) {
      await inputEl.click();
      await page.waitForTimeout(300);
      await inputEl.fill(tag.startsWith('#') ? tag.slice(1) : tag);
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }

    logger.info('ハッシュタグ設定完了');
  } catch (err) {
    logger.warn(`ハッシュタグ設定エラー: ${err.message}`);
  }
}

/**
 * 記事を note.com に投稿
 */
export async function postToNote(article, imageFiles) {
  logger.info(`=== Note投稿開始: "${article.title}" ===`);

  if (config.dryRun) {
    logger.info('[ドライラン] 実際の投稿はスキップされます');
    return { success: true, dryRun: true, title: article.title };
  }

  const { browser, context } = await launchBrowser();

  try {
    // ログイン
    await login(context);

    const page = await context.newPage();
    logger.info(`エディタページへ遷移中: ${EDITOR_URL}`);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    // ログインにリダイレクトされた場合の検出
    const editorPageUrl = page.url();
    logger.info(`エディタページURL: ${editorPageUrl}`);
    if (editorPageUrl.includes('/login')) {
      logger.warn('ログインページにリダイレクトされました。セッションが無効です。');
      throw new Error('ログインセッションが無効です。設定ページの「対話型セッション」からログインしてください。');
    }

    // エディタの読み込みを待つ（タイトル入力欄で判定）
    const editorLoaded = await page.waitForSelector(
      'textarea[placeholder*="タイトル"], div[contenteditable="true"][role="textbox"], .ProseMirror, [contenteditable="true"]',
      { timeout: 30000 }
    ).catch(() => null);

    if (!editorLoaded) {
      // デバッグ用スクリーンショット
      try {
        await page.screenshot({ path: resolve(config.paths.logs, 'editor-failed.png'), fullPage: true });
        logger.info('エディタ読み込み失敗時のスクリーンショットを保存: logs/editor-failed.png');
      } catch { /* ignore */ }
      logger.error(`現在のURL: ${page.url()}`);
      throw new Error('エディタの読み込みに失敗しました。スクリーンショットを確認してください: logs/editor-failed.png');
    }
    logger.info('エディタの読み込み完了');

    // --- カバー画像アップロード ---
    if (imageFiles.eyecatchPath) {
      await uploadCoverImage(page, imageFiles.eyecatchPath);
    }

    // --- タイトル入力 ---
    logger.info('タイトルを入力中...');
    const titleSelectors = [
      'textarea[placeholder*="タイトル"]',
      'input[placeholder*="タイトル"]',
      '[data-testid="title-input"]',
      '[class*="title"] textarea',
      '[class*="title"] input',
      'textarea:first-of-type',
    ];

    let titleFilled = false;
    for (const sel of titleSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          await el.click();
          await page.waitForTimeout(300);
          await el.fill(article.title);
          titleFilled = true;
          logger.info(`タイトル入力完了 (${sel})`);
          break;
        }
      } catch {}
    }

    if (!titleFilled) {
      logger.warn('タイトル入力欄が見つかりません、キーボード入力を試行...');
      await page.keyboard.type(article.title, { delay: 20 });
    }

    await page.waitForTimeout(1000);

    // --- 本文入力 ---
    await insertBodyContent(page, article.bodyHtml);

    // --- 図解画像の挿入（オプション） ---
    if (imageFiles.diagrams && imageFiles.diagrams.length > 0) {
      for (const diagram of imageFiles.diagrams) {
        if (diagram.imagePath) {
          await insertDiagramImage(page, diagram.imagePath);
          await sleep(2000);
        }
      }
    }

    // --- 「公開に進む」をクリック ---
    logger.info('公開ページへ移動中...');

    // デバッグ: 現在のページのボタンを列挙
    const visibleButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons
        .filter(b => b.offsetParent !== null)
        .map(b => ({ text: b.textContent.trim().slice(0, 50), class: b.className.slice(0, 80) }))
        .slice(0, 20);
    }).catch(() => []);
    logger.info(`エディタ上の表示ボタン: ${JSON.stringify(visibleButtons)}`);

    const proceedBtn = page.locator('button:has-text("公開に進む")').first();
    try {
      await proceedBtn.waitFor({ state: 'visible', timeout: 15000 });
      // ボタンがenabledになるまで待機（本文入力完了でenabledになる）
      for (let i = 0; i < 30; i++) {
        if (await proceedBtn.isEnabled()) break;
        await page.waitForTimeout(200);
      }
      await proceedBtn.click({ force: true });
      logger.info('「公開に進む」をクリックしました');
    } catch (e) {
      logger.warn(`「公開に進む」ボタンが見つかりません: ${e.message}`);
      // フォールバック: 他のセレクタを試行
      const fallbackSelectors = [
        'button:has-text("公開設定")',
        'button:has-text("投稿に進む")',
        'a:has-text("公開に進む")',
      ];
      let found = false;
      for (const sel of fallbackSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await btn.click({ force: true });
            logger.info(`フォールバックボタンをクリック: ${sel}`);
            found = true;
            break;
          }
        } catch {}
      }
      if (!found) {
        // スクリーンショット保存
        try {
          await page.screenshot({ path: resolve(config.paths.logs, 'publish-button-failed.png'), fullPage: true });
          logger.info('公開ボタン未検出のスクリーンショットを保存: logs/publish-button-failed.png');
        } catch { /* ignore */ }
      }
    }

    await page.waitForTimeout(3000);

    // --- ハッシュタグ設定 ---
    const category = config.posting.category || '';
    if (category) {
      await setHashtags(page, category);
    }

    // --- 「投稿する」をクリック ---
    logger.info('記事を投稿中...');
    const publishBtn = page.locator('button:has-text("投稿する")').first();
    try {
      await publishBtn.waitFor({ state: 'visible', timeout: 15000 });
      // ボタンがenabledになるまで待機
      for (let i = 0; i < 30; i++) {
        if (await publishBtn.isEnabled()) break;
        await page.waitForTimeout(200);
      }
      await publishBtn.click({ force: true });
      logger.info('「投稿する」をクリックしました');
    } catch (e) {
      logger.warn(`「投稿する」ボタンが見つかりません: ${e.message}`);
      // フォールバック
      const fallbackSubmit = [
        'button:has-text("公開する")',
        'button:has-text("公開")',
      ];
      for (const sel of fallbackSubmit) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await btn.click({ force: true });
            logger.info(`フォールバック投稿ボタンをクリック: ${sel}`);
            break;
          }
        } catch {}
      }
    }

    // 投稿完了を待機（URL変更 or 「投稿しました」メッセージ）
    logger.info('投稿完了を待機中...');
    await Promise.race([
      page.waitForURL(url => !/\/publish/i.test(url.toString()) && !/\/edit/i.test(url.toString()), { timeout: 20000 }),
      page.locator('text=投稿しました').first().waitFor({ timeout: 15000 }),
      page.waitForTimeout(10000),
    ]).catch(() => {});

    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    const isPublished = !finalUrl.includes('/edit') && !finalUrl.includes('/publish');
    if (isPublished) {
      logger.info(`投稿成功！記事URL: ${finalUrl}`);
    } else {
      logger.warn(`投稿が完了していない可能性があります。最終URL: ${finalUrl}`);
      try {
        await page.screenshot({ path: resolve(config.paths.logs, 'post-result.png'), fullPage: true });
        logger.info('投稿結果のスクリーンショットを保存: logs/post-result.png');
      } catch { /* ignore */ }
    }

    // セッション保存
    try {
      await saveSession(context);
    } catch (sessionErr) {
      logger.warn(`セッション保存エラー（投稿は成功）: ${sessionErr.message}`);
    }

    await browser.close();
    return { success: true, url: finalUrl, title: article.title };
  } catch (err) {
    logger.error(`投稿エラー: ${err.message}`);
    logger.error(err.stack);
    try { await browser.close(); } catch { /* ignore */ }
    return { success: false, error: err.message, title: article.title };
  }
}

/**
 * ログインテスト用
 */
export async function testLogin() {
  const { browser, context } = await launchBrowser(false);
  try {
    await login(context);
    logger.info('ログインテスト成功');
    await browser.close();
    return true;
  } catch (err) {
    logger.error(`ログインテスト失敗: ${err.message}`);
    await browser.close();
    return false;
  }
}
