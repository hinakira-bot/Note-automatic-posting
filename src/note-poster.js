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
 *
 * note.comの見出し画像アップロードは2段階:
 * 1. カバー画像エリアのボタンをクリック → ドロップダウンメニューが表示
 * 2. メニューから「画像をアップロード」を選択 → filechooserが発火
 */
async function uploadCoverImage(page, imagePath) {
  if (!imagePath || !existsSync(imagePath)) {
    logger.warn(`カバー画像ファイルが見つかりません: ${imagePath}`);
    return false;
  }

  try {
    logger.info(`カバー画像アップロード中: ${imagePath}`);

    // デバッグ: 現在のページ状態をスクリーンショット
    try {
      await page.screenshot({ path: resolve(config.paths.logs, 'before-cover-upload.png'), fullPage: true });
    } catch { /* ignore */ }

    // デバッグ: エディタ上部のDOM構造を確認
    const topButtons = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const allBtns = Array.from(main.querySelectorAll('button'));
      return allBtns
        .filter(b => {
          const rect = b.getBoundingClientRect();
          return rect.top < 200 && b.offsetParent !== null;
        })
        .map(b => ({
          text: b.textContent.trim().slice(0, 50),
          class: b.className.slice(0, 100),
          ariaLabel: b.getAttribute('aria-label') || '',
          rect: {
            top: Math.round(b.getBoundingClientRect().top),
            left: Math.round(b.getBoundingClientRect().left),
            width: Math.round(b.getBoundingClientRect().width),
            height: Math.round(b.getBoundingClientRect().height),
          },
          html: b.outerHTML.slice(0, 200),
        }));
    }).catch(() => []);
    logger.info(`エディタ上部のボタン(top<200px): ${JSON.stringify(topButtons)}`);

    // === 方法A: 2段階クリック（メニュー経由） ===
    let coverUploaded = false;

    // Step 1: カバー画像エリアのボタンをクリック（メニューを開く）
    const coverAreaSelectors = [
      // note.com エディタの見出し画像ボタン（エディタ最上部の小さなボタン）
      'main button:first-of-type',
      'main > div:first-child button',
      'main > div > div:first-child button',
      'button[aria-label*="画像"]',
      'button[aria-label*="見出し"]',
      'button[aria-label*="カバー"]',
      'button[aria-label*="header"]',
      '[class*="headerImage"] button',
      '[class*="cover"] button',
      '[class*="eyecatch"] button',
    ];

    for (const sel of coverAreaSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          // ボタンの位置を確認（カバー画像ボタンはエディタ上部にあるはず）
          const box = await el.boundingBox().catch(() => null);
          if (box && box.y > 400) continue; // 画面下部のボタンはスキップ

          logger.info(`カバー画像エリアをクリック: ${sel} (y=${box?.y})`);
          await el.click();
          await page.waitForTimeout(1500);

          // Step 2: ドロップダウンメニューから「画像をアップロード」を選択
          const uploadMenuSelectors = [
            'button:has-text("画像をアップロード")',
            'button:text-is("画像をアップロード")',
            'div[role="menu"] button:first-of-type',
            'div[role="listbox"] button:first-of-type',
            '[class*="dropdown"] button:has-text("アップロード")',
            '[class*="menu"] button:has-text("アップロード")',
            '[class*="popup"] button:has-text("アップロード")',
          ];

          let menuFound = false;
          for (const menuSel of uploadMenuSelectors) {
            try {
              const menuBtn = page.locator(menuSel).first();
              if (await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                logger.info(`アップロードメニュー項目発見: ${menuSel}`);
                // filechooserを待機しつつメニュー項目をクリック
                const [fileChooser] = await Promise.all([
                  page.waitForEvent('filechooser', { timeout: 15000 }),
                  menuBtn.click(),
                ]);
                await fileChooser.setFiles(imagePath);
                coverUploaded = true;
                menuFound = true;
                logger.info('filechooserでファイルを設定しました');
                break;
              }
            } catch (menuErr) {
              logger.debug?.(`メニュー項目 ${menuSel} 失敗: ${menuErr.message}`);
            }
          }

          if (menuFound) break;

          // メニューが見つからない場合、直接filechooserが発火するパターンかも
          // （古いUIの場合は1クリックで直接filechooserが開く可能性あり）
          logger.info('メニューが見つかりません。直接filechooser待機を試行...');
        }
      } catch (e) {
        logger.debug?.(`カバーセレクタ ${sel} 失敗: ${e.message}`);
      }
    }

    // === 方法B: 1段階直接クリック（filechooserが直接開くパターン） ===
    if (!coverUploaded) {
      logger.info('方法A失敗。1段階直接クリックを試行...');

      const directSelectors = [
        'main button:first-of-type',
        'main > div:first-child button',
        '[class*="Header"] button',
        '[class*="header"] button:first-of-type',
      ];

      for (const sel of directSelectors) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
            const box = await el.boundingBox().catch(() => null);
            if (box && box.y > 300) continue;

            logger.info(`直接filechooser試行: ${sel} (y=${box?.y})`);
            try {
              const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 8000 }),
                el.click(),
              ]);
              await fileChooser.setFiles(imagePath);
              coverUploaded = true;
              logger.info('直接filechooserでファイルを設定しました');
              break;
            } catch {
              // filechooserが発火しなかった場合、メニューが開いている可能性
              // メニュー内のボタンを再探索
              const visibleMenuBtns = await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                return btns
                  .filter(b => b.offsetParent !== null && b.textContent.includes('アップロード'))
                  .map(b => ({ text: b.textContent.trim().slice(0, 50), class: b.className.slice(0, 80) }));
              }).catch(() => []);

              if (visibleMenuBtns.length > 0) {
                logger.info(`メニュー内アップロードボタン発見: ${JSON.stringify(visibleMenuBtns)}`);
                try {
                  const uploadBtn = page.locator('button:has-text("アップロード")').first();
                  const [fileChooser] = await Promise.all([
                    page.waitForEvent('filechooser', { timeout: 10000 }),
                    uploadBtn.click(),
                  ]);
                  await fileChooser.setFiles(imagePath);
                  coverUploaded = true;
                  logger.info('メニュー経由でファイルを設定しました');
                  break;
                } catch {}
              }

              // Escで閉じて次のセレクタを試す
              await page.keyboard.press('Escape');
              await page.waitForTimeout(500);
            }
          }
        } catch {}
      }
    }

    // === 方法C: SVGアイコンやimgタグをクリック（アイコンベースUI） ===
    if (!coverUploaded) {
      logger.info('方法B失敗。SVGアイコン検索を試行...');
      try {
        // エディタ上部のSVGアイコン（カメラ/画像アイコン）を探す
        const iconElement = await page.evaluate(() => {
          const svgs = Array.from(document.querySelectorAll('main svg, main img'));
          for (const svg of svgs) {
            const rect = svg.getBoundingClientRect();
            // エディタ上部（y < 200）にある小さなアイコン
            if (rect.top < 200 && rect.width < 100 && rect.height < 100) {
              const parent = svg.closest('button') || svg.closest('div[role="button"]') || svg.parentElement;
              if (parent) {
                return {
                  found: true,
                  tag: parent.tagName,
                  class: parent.className?.toString()?.slice(0, 100) || '',
                  y: Math.round(rect.top),
                };
              }
            }
          }
          return { found: false };
        }).catch(() => ({ found: false }));

        if (iconElement.found) {
          logger.info(`SVGアイコンの親要素発見: ${JSON.stringify(iconElement)}`);

          // SVGアイコンの親要素をクリック
          const iconBtn = page.locator('main svg, main img').first();
          const parentBtn = iconBtn.locator('..');
          await parentBtn.click();
          await page.waitForTimeout(1500);

          // メニューが開いたかチェック
          const uploadOpt = page.locator('button:has-text("画像をアップロード"), button:has-text("アップロード")').first();
          if (await uploadOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 15000 }),
              uploadOpt.click(),
            ]);
            await fileChooser.setFiles(imagePath);
            coverUploaded = true;
            logger.info('SVGアイコン経由でファイルを設定しました');
          }
        }
      } catch (e) {
        logger.debug?.(`SVGアイコン検索失敗: ${e.message}`);
      }
    }

    // === 方法D: input[type="file"]に直接設定（hidden inputがある場合） ===
    if (!coverUploaded) {
      logger.info('方法C失敗。hidden input[type="file"]を探索...');
      try {
        const fileInputs = page.locator('input[type="file"]');
        const count = await fileInputs.count();
        if (count > 0) {
          logger.info(`input[type="file"]が${count}個見つかりました。最初のものにファイルを設定...`);
          await fileInputs.first().setInputFiles(imagePath);
          coverUploaded = true;
          logger.info('hidden input経由でファイルを設定しました');
        }
      } catch (e) {
        logger.debug?.(`hidden input設定失敗: ${e.message}`);
      }
    }

    // === 方法E: API経由でアイキャッチ設定（最終フォールバック） ===
    if (!coverUploaded) {
      logger.info('全UI方法失敗。API経由でのアップロードを試行...');
      try {
        coverUploaded = await uploadCoverImageViaAPI(page, imagePath);
      } catch (e) {
        logger.warn(`API経由アップロード失敗: ${e.message}`);
      }
    }

    if (!coverUploaded) {
      logger.warn('カバー画像のアップロードに全方法で失敗しました');
      try {
        await page.screenshot({ path: resolve(config.paths.logs, 'cover-upload-failed.png'), fullPage: true });
      } catch { /* ignore */ }
      return false;
    }

    await page.waitForTimeout(3000);

    // === トリミングダイアログの処理 ===
    await handleCropperDialog(page);

    logger.info('カバー画像をアップロードしました');
    return true;
  } catch (err) {
    logger.warn(`カバー画像アップロードエラー: ${err.message}`);
    try {
      await page.screenshot({ path: resolve(config.paths.logs, 'cover-upload-error.png'), fullPage: true });
    } catch { /* ignore */ }
    return false;
  }
}

/**
 * API経由でカバー画像をアップロード（UIが失敗した場合のフォールバック）
 * note.com の非公式API: POST /api/v1/upload_image でアップロード
 */
async function uploadCoverImageViaAPI(page, imagePath) {
  const { readFileSync } = await import('fs');
  const imageBuffer = readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = imagePath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  const mimeType = `image/${ext}`;

  // ページのcookieを使ってAPI呼び出し
  const result = await page.evaluate(async ({ base64Image, mimeType, ext }) => {
    try {
      // Base64をBlobに変換
      const byteChars = atob(base64Image);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      // FormDataでアップロード
      const formData = new FormData();
      formData.append('image', blob, `cover.${ext}`);

      const response = await fetch('https://note.com/api/v1/upload_image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return {
        success: true,
        imageKey: data?.data?.key || null,
        imageUrl: data?.data?.url || null,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, { base64Image, mimeType, ext }).catch(err => ({ success: false, error: err.message }));

  if (!result.success) {
    logger.warn(`API画像アップロード失敗: ${result.error}`);
    return false;
  }

  logger.info(`API画像アップロード成功: key=${result.imageKey}`);

  // アップロード後、エディタのUIに反映させるため、ページをリロードせずにDOMを操作
  // note.com のエディタは React/Redux ベースなので、API呼び出し後に
  // ドラフト保存APIで eyecatch_image_key を設定するのが確実
  if (result.imageKey) {
    // 現在のエディタURLからarticle IDを取得（ドラフト保存済みの場合）
    const pageUrl = page.url();
    const articleIdMatch = pageUrl.match(/\/(\d+)(?:\?|$)/);

    if (articleIdMatch) {
      const articleId = articleIdMatch[1];
      const saveResult = await page.evaluate(async ({ articleId, imageKey }) => {
        try {
          const response = await fetch(`https://note.com/api/v1/text_notes/draft_save?id=${articleId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eyecatch_image_key: imageKey }),
            credentials: 'include',
          });
          return { success: response.ok, status: response.status };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }, { articleId, imageKey: result.imageKey }).catch(err => ({ success: false, error: err.message }));

      if (saveResult.success) {
        logger.info(`APIでアイキャッチ設定完了: articleId=${articleId}`);
        // ページをリロードしてUIに反映
        await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
        await page.waitForTimeout(3000);
        return true;
      }
      logger.warn(`APIドラフト保存失敗: ${JSON.stringify(saveResult)}`);
    } else {
      logger.info('記事IDが未確定（新規記事）。API eyecatch設定は投稿後に行います。');
      // imageKeyを返してpostToNoteで使えるようにする
      // グローバル変数に保持
      global.__pendingEyecatchKey = result.imageKey;
      return true;
    }
  }

  return false;
}

/**
 * トリミングダイアログ（reactEasyCrop）の検出と処理
 */
async function handleCropperDialog(page) {
  const cropperSelectors = [
    '[data-testid="cropper"]',
    '.reactEasyCrop_CropArea',
    '.ReactModalPortal .reactEasyCrop_Container',
    '[class*="cropper"]',
    '[class*="Cropper"]',
    '[class*="crop-area"]',
  ];

  let hasCropper = false;
  for (const sel of cropperSelectors) {
    if (await page.locator(sel).first().isVisible({ timeout: 3000 }).catch(() => false)) {
      hasCropper = true;
      break;
    }
  }

  if (!hasCropper) {
    logger.info('トリミングダイアログなし。そのまま続行。');
    return;
  }

  logger.info('トリミングダイアログを検出しました。確認ボタンを探しています...');

  // デバッグ: ダイアログ内のボタンを列挙
  const dialogButtons = await page.evaluate(() => {
    const modal = document.querySelector('.ReactModalPortal') || document;
    const buttons = Array.from(modal.querySelectorAll('button'));
    return buttons
      .filter(b => b.offsetParent !== null)
      .map(b => ({ text: b.textContent.trim().slice(0, 50), class: b.className.slice(0, 80) }));
  }).catch(() => []);
  logger.info(`トリミングダイアログ内のボタン: ${JSON.stringify(dialogButtons)}`);

  // 確認ボタンを押す（OKボタン）
  const trimConfirmSelectors = [
    '.ReactModalPortal button:has-text("OK")',
    '.ReactModalPortal button:has-text("保存")',
    '.ReactModalPortal button:has-text("適用")',
    '.ReactModalPortal button:has-text("完了")',
    '.ReactModalPortal button:has-text("決定")',
    'button:has-text("OK")',
    'button:has-text("保存")',
    'button:has-text("適用")',
    'button:has-text("完了")',
    '[data-testid="crop-confirm"]',
  ];

  let trimClosed = false;
  for (const sel of trimConfirmSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click({ force: true });
        logger.info(`トリミングダイアログを確認: ${sel}`);
        trimClosed = true;
        await page.waitForTimeout(2000);
        break;
      }
    } catch {}
  }

  if (!trimClosed) {
    // フォールバック: Escキーでダイアログを閉じる
    logger.warn('トリミング確認ボタンが見つかりません。Escキーで閉じます...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
  }

  // ダイアログが閉じたか確認
  const stillHasCropper = await page.locator('[data-testid="cropper"], .reactEasyCrop_CropArea, [class*="cropper"]').first()
    .isVisible({ timeout: 2000 }).catch(() => false);
  if (stillHasCropper) {
    logger.warn('トリミングダイアログがまだ表示されています。スクリーンショットを保存...');
    try {
      await page.screenshot({ path: resolve(config.paths.logs, 'cropper-stuck.png'), fullPage: true });
    } catch { /* ignore */ }
    // 最終手段: Enterキーで確定
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  }
}

/**
 * note.com エディタに本文を挿入
 * contenteditable div にHTMLをペーストする
 */
async function insertBodyContent(page, bodyHtml) {
  try {
    logger.info('本文を入力中...');

    // トリミングダイアログが残っていないか確認（残っている場合は閉じる）
    const hasCropperStill = await page.locator('.reactEasyCrop_CropArea, .ReactModalPortal .reactEasyCrop_Container').first()
      .isVisible({ timeout: 2000 }).catch(() => false);
    if (hasCropperStill) {
      logger.warn('トリミングダイアログが残っています。閉じます...');
      try {
        // 「保存」「適用」「完了」「OK」ボタンを探してクリック
        const cropBtnSelectors = [
          '.ReactModalPortal button:has-text("保存")',
          '.ReactModalPortal button:has-text("適用")',
          '.ReactModalPortal button:has-text("完了")',
          '.ReactModalPortal button:has-text("OK")',
        ];
        let cropClosed = false;
        for (const sel of cropBtnSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
              await btn.click({ force: true });
              cropClosed = true;
              break;
            }
          } catch {}
        }
        if (!cropClosed) {
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(2000);
      } catch {}
    }

    // note.com のHTMLをシンプルに変換（不要な属性を除去）
    const cleanHtml = bodyHtml
      .replace(/\s*id="heading-\d+"/g, '')  // heading ID属性を除去
      .replace(/\s*class="[^"]*"/g, '');     // class属性を除去

    // 方法1: クリップボード経由でペースト（最も確実）
    // note.comの本文エディタセレクタ（タイトルheading要素を除外するため具体的に指定）
    const editorSelectors = [
      '.ProseMirror.note-common-styles__textnote-body',
      'div[contenteditable="true"][role="textbox"].ProseMirror',
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

    // エディタにフォーカス（force: trueでオーバーレイを回避）
    await editorEl.click({ force: true });
    await page.waitForTimeout(500);

    // カーソルがタイトル部分にいる可能性があるため、本文エリアの先頭段落をクリック
    const bodyParagraph = page.locator('.ProseMirror p, .ProseMirror .paragraph, div[contenteditable="true"][role="textbox"] p').first();
    if (await bodyParagraph.isVisible({ timeout: 2000 }).catch(() => false)) {
      await bodyParagraph.click({ force: true });
      await page.waitForTimeout(300);
      logger.info('本文エリアの段落にフォーカスしました');
    }

    // 本文エリアを全選択してクリア（既存のプレースホルダーテキスト等を除去）
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);

    // クリップボードにHTMLをセットしてペースト
    const pasted = await page.evaluate(async (html) => {
      // 本文エディタを特定（タイトル要素を除外）
      const editor = document.querySelector('.ProseMirror.note-common-styles__textnote-body') ||
                     document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                     document.querySelector('.ProseMirror') ||
                     document.querySelector('div[contenteditable="true"]');
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
      await page.waitForTimeout(2000);

      // ペースト成功したか内容確認
      const pastedLength = await page.evaluate(() => {
        const editor = document.querySelector('.ProseMirror.note-common-styles__textnote-body') ||
                       document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                       document.querySelector('.ProseMirror') ||
                       document.querySelector('div[contenteditable="true"]');
        return editor ? editor.innerText.trim().length : 0;
      });

      if (pastedLength > 100) {
        logger.info(`HTMLペーストで本文を挿入しました（${pastedLength}文字）`);
        return true;
      }
      logger.info(`ペーストイベントは発火したが内容が不十分（${pastedLength}文字）。フォールバックへ...`);
    }

    // 方法2: innerHTML直接設定（フォールバック）
    logger.info('ペースト失敗、innerHTML直接設定を試行...');
    await page.evaluate((html) => {
      const editor = document.querySelector('.ProseMirror.note-common-styles__textnote-body') ||
                     document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                     document.querySelector('.ProseMirror') ||
                     document.querySelector('div[contenteditable="true"]');
      if (editor) {
        // ProseMirrorの場合、最初のheading（タイトル）は残してその後に挿入
        const heading = editor.querySelector('.heading, h1');
        if (heading) {
          // タイトル以降の既存コンテンツをクリア
          let sibling = heading.nextElementSibling;
          while (sibling) {
            const next = sibling.nextElementSibling;
            sibling.remove();
            sibling = next;
          }
          // HTMLをパースしてタイトルの後に挿入
          const temp = document.createElement('div');
          temp.innerHTML = html;
          while (temp.firstChild) {
            editor.appendChild(temp.firstChild);
          }
        } else {
          editor.innerHTML = html;
        }
        // React/ProseMirrorの変更検知をトリガー
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, cleanHtml);

    await page.waitForTimeout(2000);

    // 入力確認
    const contentLength = await page.evaluate(() => {
      const editor = document.querySelector('.ProseMirror.note-common-styles__textnote-body') ||
                     document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                     document.querySelector('.ProseMirror') ||
                     document.querySelector('div[contenteditable="true"]');
      return editor ? editor.innerText.length : 0;
    });

    if (contentLength > 100) {
      logger.info(`本文入力完了（${contentLength}文字）`);
      return true;
    }

    // 方法3: キーボード入力（最終フォールバック）
    logger.info('直接設定も失敗、キーボード入力を試行...');
    const plainText = cleanHtml.replace(/<[^>]*>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    await editorEl.click({ force: true });
    await page.waitForTimeout(300);
    await page.keyboard.type(plainText.slice(0, 5000), { delay: 5 });
    await page.waitForTimeout(1000);
    logger.info('キーボード入力で本文を入力しました（プレーンテキスト）');
    return true;
  } catch (err) {
    logger.error(`本文入力エラー: ${err.message}`);
    // デバッグ用スクリーンショット
    try {
      await page.screenshot({ path: resolve(config.paths.logs, 'body-input-failed.png'), fullPage: true });
      logger.info('本文入力失敗時のスクリーンショットを保存: logs/body-input-failed.png');
    } catch { /* ignore */ }
    return false;
  }
}

/**
 * 本文中に図解画像を挿入
 *
 * ログ分析で判明した事実:
 *   - note.comの「挿入」メニューはエディタ読み込み時に自動表示される
 *   - メニュー内の「画像」ボタン: class="sc-6fa32351-4 eYVdgL", text="画像"
 *   - 「追加」ボタンはDOMに存在しない（メニューは自動表示済み）
 *   - fileInputsは「画像」クリック後に動的生成される
 *
 * @param {import('playwright').Page} page
 * @param {string} imagePath - 画像ファイルのパス
 * @param {string} h2Text - 対応するh2見出しテキスト（ログ用）
 * @param {number} h2Index - アウトラインでのh2インデックス（位置特定用）
 */
async function insertDiagramImage(page, imagePath, h2Text, h2Index = -1) {
  if (!imagePath || !existsSync(imagePath)) return false;

  try {
    logger.info(`図解画像を挿入中: ${imagePath} (h2: ${h2Text || 'N/A'})`);

    // === Step 1: エディタにフォーカスを確保 ===
    const editor = page.locator('.ProseMirror').first();
    const editorVisible = await editor.isVisible({ timeout: 3000 }).catch(() => false);
    if (!editorVisible) {
      logger.warn('ProseMirrorエディタが見つかりません');
      return false;
    }
    await editor.click({ force: true });
    await page.waitForTimeout(500);

    // === Step 2: カーソルを挿入位置に配置 ===
    // h2Indexを使って直接エディタ内のh2要素を特定する（テキストマッチは誤配置の原因）
    const cursorResult = await page.evaluate(({ targetH2, targetIndex }) => {
      const editor = document.querySelector('.ProseMirror') ||
                     document.querySelector('div[contenteditable="true"][role="textbox"]');
      if (!editor) return { type: 'not_found' };

      // プレースホルダーテキストを探す
      const paragraphs = editor.querySelectorAll('p, .paragraph');
      for (const p of paragraphs) {
        const text = p.textContent.trim();
        if (text.includes('ここに図解') || text.includes('図解画像を挿入') ||
            text.includes('画像を挿入') || text === '（ここに図解画像を挿入）') {
          p.click();
          const range = document.createRange();
          range.selectNodeContents(p);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          return { type: 'placeholder' };
        }
      }

      // インデックスでh2を直接特定（テキストマッチより確実）
      const headings = editor.querySelectorAll('h2');
      if (targetIndex >= 0 && targetIndex < headings.length) {
        const h2 = headings[targetIndex];
        return { type: 'h2_found', index: targetIndex, text: h2.textContent.trim().slice(0, 30) };
      }

      // インデックスが無効な場合、テキストでフォールバック（完全一致優先）
      if (targetH2) {
        for (let i = 0; i < headings.length; i++) {
          const hText = headings[i].textContent.trim();
          if (hText === targetH2) {
            return { type: 'h2_found', index: i, text: hText.slice(0, 30) };
          }
        }
        // 部分一致（長めに比較）
        for (let i = 0; i < headings.length; i++) {
          const hText = headings[i].textContent.trim();
          if (hText.includes(targetH2.slice(0, 30)) || targetH2.includes(hText.slice(0, 30))) {
            return { type: 'h2_found', index: i, text: hText.slice(0, 30) };
          }
        }
      }
      return { type: 'not_found' };
    }, { targetH2: h2Text, targetIndex: h2Index });

    if (cursorResult.type === 'placeholder') {
      // プレースホルダーを削除して空の段落にする
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
      logger.info('プレースホルダーテキストを削除しました');
    } else if (cursorResult.type === 'h2_found') {
      // ProseMirrorはforce:trueクリックでは内部状態が更新されないことがある
      // → scrollIntoView + 実座標クリック + ArrowDown方式に変更

      // まずh2をビューポート中央にスクロールし、座標を取得
      const h2Rect = await page.evaluate((idx) => {
        const editor = document.querySelector('.ProseMirror') ||
                       document.querySelector('div[contenteditable="true"][role="textbox"]');
        if (!editor) return null;
        const headings = editor.querySelectorAll('h2');
        const h2 = headings[idx];
        if (!h2) return null;
        h2.scrollIntoView({ block: 'center', behavior: 'instant' });
        const rect = h2.getBoundingClientRect();
        return {
          // h2テキストの末尾付近（右端から少し内側）をクリック
          x: Math.min(rect.right - 10, rect.left + rect.width * 0.9),
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        };
      }, cursorResult.index);

      await page.waitForTimeout(500);

      if (h2Rect && h2Rect.width > 0) {
        // 実座標でマウスクリック（ProseMirrorのイベントハンドラが正しく起動する）
        await page.mouse.click(h2Rect.x, h2Rect.y);
        await page.waitForTimeout(400);

        // Endキーでh2テキスト末尾に移動
        await page.keyboard.press('End');
        await page.waitForTimeout(300);

        // Enterでh2の直下に新しい空パラグラフを作成
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // 検証: カーソルがh2内ではなくパラグラフにいることを確認
        const cursorCheck = await page.evaluate(() => {
          const sel = window.getSelection();
          if (!sel || !sel.anchorNode) return 'no_selection';
          const node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
          return node ? node.tagName : 'unknown';
        }).catch(() => 'error');
        logger.info(`h2[${cursorResult.index}]「${cursorResult.text}」の直下にカーソル配置 (現在のノード: ${cursorCheck})`);
      } else {
        logger.warn(`h2[${cursorResult.index}]のBoundingRect取得失敗。エディタ末尾に挿入します`);
        await editor.click({ force: true });
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
    } else {
      // 見つからない場合でもエディタ末尾に新しい行を作成
      logger.warn('図解画像の挿入位置が見つかりません。エディタ末尾に挿入します');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }

    // === Step 3: スラッシュコマンドで画像を挿入（メインメソッド） ===
    // ログ分析で判明:
    //   - サイドバーの「画像」ボタンをクリックしてもfileChooserが開かない
    //   - ProseMirrorのスラッシュコマンド（"/" 入力）→「画像」選択 でfileChooserが正常に開く
    //   - スラッシュコマンドは空の段落で有効
    let uploaded = false;

    // 方法A: スラッシュコマンド（"/" を入力してメニューを開く）
    for (let attempt = 0; attempt < 2 && !uploaded; attempt++) {
      logger.info(`スラッシュコマンドで画像挿入を試みます (試行${attempt + 1}/2)...`);

      // 2回目の試行では新しい空行を確保
      if (attempt === 1) {
        await editor.click({ force: true });
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }

      // "/" を入力してスラッシュコマンドメニューを開く
      await page.keyboard.type('/');
      await page.waitForTimeout(1000);

      // メニューが開いたか確認: 表示中の「画像」ボタンを探す
      const imgMenuBtn = page.locator('button:has-text("画像"):visible').first();
      const menuOpened = await imgMenuBtn.isVisible({ timeout: 2000 }).catch(() => false);

      if (menuOpened) {
        logger.info('スラッシュコマンドで挿入メニューを開きました');

        try {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 10000 }),
            imgMenuBtn.click(),
          ]);
          await fileChooser.setFiles(imagePath);
          uploaded = true;
          logger.info('「挿入」→「画像」→ファイルチューザーでアップロード成功');
        } catch (fcErr) {
          logger.info(`スラッシュコマンドクリック失敗: ${fcErr.message.slice(0, 80)}`);
          // メニューが開いたがfileChooserが来なかった場合: file inputを探す
          await page.waitForTimeout(1000);
          const fiCount = await page.locator('input[type="file"]').count().catch(() => 0);
          if (fiCount > 0) {
            try {
              await page.locator('input[type="file"]').last().setInputFiles(imagePath);
              uploaded = true;
              logger.info('スラッシュコマンド→file input経由でアップロード成功');
            } catch {}
          }
        }
      } else {
        // メニューが開かなかった → "/" を削除
        logger.info('スラッシュコマンドメニューが開きませんでした。"/"を削除');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(300);
      }
    }

    // 方法B: サイドバーのトグルボタン→「画像」クリック（フォールバック）
    if (!uploaded) {
      logger.info('方法B: サイドバーメニューから画像挿入を試みます...');

      // サイドバーの挿入メニューを開く: トグルボタン（class に sc-6fa32351 含む空テキストボタン）をクリック
      const toggleBtn = page.locator('button[class*="sc-6fa32351"]').first();
      if (await toggleBtn.count().catch(() => 0) > 0) {
        await toggleBtn.click({ force: true });
        await page.waitForTimeout(1000);
        logger.info('サイドバートグルボタンをクリック');
      }

      // 「画像」ボタンを探してクリック
      const sidebarImgBtn = page.locator('button:has-text("画像"):visible').first();
      if (await sidebarImgBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        try {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 10000 }),
            sidebarImgBtn.click({ force: true }),
          ]);
          await fileChooser.setFiles(imagePath);
          uploaded = true;
          logger.info('サイドバー→画像→ファイルチューザーでアップロード成功');
        } catch (e) {
          logger.info(`サイドバーメソッド失敗: ${e.message.slice(0, 80)}`);
        }
      }
    }

    // 方法C: DOM操作でfile inputを作成してアップロード（最終フォールバック）
    if (!uploaded) {
      logger.info('方法C: DOM操作でfile inputを作成してアップロードを試みます...');

      // エディタ内にfile inputが既にあるか確認
      const existingFi = await page.locator('input[type="file"]').count().catch(() => 0);
      if (existingFi > 0) {
        try {
          await page.locator('input[type="file"]').last().setInputFiles(imagePath);
          uploaded = true;
          logger.info('既存file input経由でアップロード成功');
        } catch {}
      }

      // file inputがない場合: 全ボタンからforce:trueで「画像」をクリック
      if (!uploaded) {
        const allBtns = await page.locator('button').all();
        for (const btn of allBtns) {
          const text = await btn.innerText().catch(() => '');
          if (text.trim() === '画像') {
            logger.info('全ボタン走査で「画像」発見。force:trueでクリック...');
            try {
              const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 8000 }),
                btn.click({ force: true }),
              ]);
              await fileChooser.setFiles(imagePath);
              uploaded = true;
              logger.info('全ボタン走査→ファイルチューザーでアップロード成功');
            } catch {}
            if (uploaded) break;
          }
        }
      }
    }

    // === Step 4: 結果確認 ===
    if (uploaded) {
      await page.waitForTimeout(3000);

      // トリミングダイアログが出た場合は閉じる
      const hasCropper = await page.locator('.reactEasyCrop_CropArea, .ReactModalPortal .reactEasyCrop_Container').first()
        .isVisible({ timeout: 2000 }).catch(() => false);
      if (hasCropper) {
        logger.info('図解画像のトリミングダイアログを検出。保存します...');
        const saveBtn = page.locator('.ReactModalPortal button:has-text("保存")').first();
        if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await saveBtn.click({ force: true });
          await page.waitForTimeout(2000);
        } else {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        }
      }

      logger.info(`図解画像を挿入しました: ${imagePath}`);
      return true;
    }

    // 失敗時ログ
    logger.warn(`図解画像アップロード失敗: 全メソッド（スラッシュコマンド, サイドバー, DOM操作）で失敗`);
    try {
      await page.screenshot({ path: resolve(config.paths.logs, 'diagram-insert-failed.png'), fullPage: true });
    } catch { /* ignore */ }

    return false;
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

    logger.info(`ハッシュタグを設定中: ${tags.join(', ')} (${tags.length}個)`);

    // デバッグ: 公開設定画面のinput要素を列挙
    const pageInputs = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs
        .filter(i => i.offsetParent !== null)
        .map(i => ({
          type: i.type,
          placeholder: i.placeholder,
          class: i.className.slice(0, 80),
          name: i.name,
          id: i.id,
        }));
    }).catch(() => []);
    logger.info(`公開設定画面のinput要素: ${JSON.stringify(pageInputs)}`);

    // note.com公開設定画面のハッシュタグ入力欄セレクタ
    // 実際のUI: placeholder="ハッシュタグを追加する"
    const hashtagSelectors = [
      'input[placeholder="ハッシュタグを追加する"]',
      'input[placeholder*="ハッシュタグ"]',
      'input[placeholder*="タグを追加"]',
      '[data-testid="hashtag-input"]',
      '[class*="hashtag"] input',
    ];

    let inputEl = null;
    for (const sel of hashtagSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          inputEl = el;
          const placeholder = await el.getAttribute('placeholder').catch(() => '');
          logger.info(`ハッシュタグ入力欄を検出: ${sel} (placeholder: ${placeholder})`);
          break;
        }
      } catch {}
    }

    if (!inputEl) {
      logger.warn('ハッシュタグ入力欄が見つかりません');
      try {
        await page.screenshot({ path: resolve(config.paths.logs, 'hashtag-input-not-found.png'), fullPage: true });
      } catch { /* ignore */ }
      return;
    }

    for (const tag of tags) {
      const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag;
      await inputEl.click();
      await page.waitForTimeout(300);
      // fill()でクリアしてからタグテキストを入力
      await inputEl.fill('');
      await page.waitForTimeout(200);
      await inputEl.fill(cleanTag);
      await page.waitForTimeout(500);
      // Enterキーでタグを確定（note.comはEnterでタグ追加）
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // タグが追加されたか確認（入力欄がクリアされていればOK）
      const inputValue = await inputEl.inputValue().catch(() => '');
      if (inputValue === '') {
        logger.info(`ハッシュタグ追加成功: #${cleanTag}`);
      } else {
        logger.warn(`ハッシュタグ追加未確認: #${cleanTag} (入力欄値: "${inputValue}")`);
        // もう一度Enterを試す
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }
    }

    // ハッシュタグが設定されたか確認のスクリーンショット
    try {
      await page.screenshot({ path: resolve(config.paths.logs, 'hashtags-set.png'), fullPage: true });
    } catch { /* ignore */ }

    logger.info('ハッシュタグ設定完了');
  } catch (err) {
    logger.warn(`ハッシュタグ設定エラー: ${err.message}`);
    try {
      await page.screenshot({ path: resolve(config.paths.logs, 'hashtag-error.png'), fullPage: true });
    } catch { /* ignore */ }
  }
}

/**
 * 記事を note.com に投稿
 * @param {object} article - 記事データ
 * @param {object} imageFiles - 画像ファイルパス
 * @param {object} options - オプション { hashtags: 'タグ1,タグ2' }
 */
export async function postToNote(article, imageFiles, options = {}) {
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

    // note.comエディタのタイトル入力方法:
    // 1. textarea（旧エディタ）
    // 2. ProseMirrorの.heading要素（新エディタ - 「記事タイトル」プレースホルダー）
    const titleSelectors = [
      'textarea[placeholder*="タイトル"]',
      'textarea[placeholder*="記事タイトル"]',
      '.ProseMirror .heading:first-child',
      '.ProseMirror > h1',
      '.ProseMirror [data-placeholder*="タイトル"]',
      '[class*="title"] textarea',
      '[class*="title"] input',
    ];

    let titleFilled = false;
    for (const sel of titleSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.click();
          await page.waitForTimeout(500);

          // textareaの場合はfill、それ以外はキーボード入力
          const tagName = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => '');
          if (tagName === 'textarea' || tagName === 'input') {
            await el.fill(article.title);
          } else {
            // ProseMirror heading要素 — 全選択して上書き
            await page.keyboard.press('Control+a');
            await page.waitForTimeout(100);
            await page.keyboard.type(article.title, { delay: 15 });
          }
          titleFilled = true;
          logger.info(`タイトル入力完了 (${sel})`);
          break;
        }
      } catch (e) {
        logger.debug?.(`タイトルセレクタ ${sel} 失敗: ${e.message}`);
      }
    }

    if (!titleFilled) {
      // フォールバック: 「記事タイトル」テキストを持つ要素を直接探す
      logger.warn('タイトル入力欄が見つかりません、プレースホルダー検索を試行...');
      try {
        const titleEl = page.locator('[data-placeholder="記事タイトル"], [data-placeholder*="タイトル"]').first();
        if (await titleEl.isVisible({ timeout: 3000 }).catch(() => false)) {
          await titleEl.click();
          await page.waitForTimeout(300);
          await page.keyboard.type(article.title, { delay: 15 });
          titleFilled = true;
          logger.info('タイトル入力完了（data-placeholder検索）');
        }
      } catch {}
    }

    if (!titleFilled) {
      // 最終フォールバック: エディタ最上部にフォーカスしてTabで移動
      logger.warn('全セレクタ失敗。エディタ先頭にフォーカスしてタイトルを入力...');
      try {
        await page.screenshot({ path: resolve(config.paths.logs, 'title-input-failed.png'), fullPage: true });
      } catch { /* ignore */ }
    }

    // タイトル入力後、本文エリアに移動（Enterキー or Tabキー）
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // --- 本文入力 ---
    await insertBodyContent(page, article.bodyHtml);

    // --- 図解画像の挿入（オプション） ---
    // 逆順で挿入（後ろのh2から処理することで、前のh2のインデックスがずれない）
    if (imageFiles.diagrams && imageFiles.diagrams.length > 0) {
      const diagramsToInsert = imageFiles.diagrams
        .filter(d => d.imagePath)
        .reverse(); // 逆順（後ろの見出しから）

      for (const diagram of diagramsToInsert) {
        logger.info(`図解挿入: index=${diagram.index}, h2="${(diagram.h2 || '').slice(0, 25)}"`);
        await insertDiagramImage(page, diagram.imagePath, diagram.h2 || '', diagram.index);
        await sleep(2000);
      }
    }

    // --- API経由eyecatch設定（UIアップロード失敗時のフォールバック） ---
    if (global.__pendingEyecatchKey) {
      logger.info('API経由でアイキャッチ画像を設定中...');
      try {
        // 現在のURLから記事IDを取得（ドラフト保存でIDが割り当てられているはず）
        const currentUrl = page.url();
        const idMatch = currentUrl.match(/\/(\d+)/);
        if (idMatch) {
          const articleId = idMatch[1];
          const apiResult = await page.evaluate(async ({ articleId, imageKey }) => {
            try {
              const response = await fetch(`https://note.com/api/v1/text_notes/draft_save?id=${articleId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eyecatch_image_key: imageKey }),
                credentials: 'include',
              });
              return { success: response.ok };
            } catch (err) {
              return { success: false, error: err.message };
            }
          }, { articleId, imageKey: global.__pendingEyecatchKey });
          if (apiResult.success) {
            logger.info(`API経由アイキャッチ設定成功: articleId=${articleId}`);
          }
        }
      } catch (e) {
        logger.warn(`API eyecatch設定失敗: ${e.message}`);
      }
      global.__pendingEyecatchKey = null;
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
    const hashtags = options.hashtags || config.posting.category || '';
    if (hashtags) {
      await setHashtags(page, hashtags);
    } else {
      logger.info('ハッシュタグ未設定（スキップ）');
    }

    // --- 公開設定画面のデバッグ ---
    logger.info('公開設定画面の状態を確認中...');
    const publishPageButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons
        .filter(b => b.offsetParent !== null)
        .map(b => ({ text: b.textContent.trim().slice(0, 60), class: b.className.slice(0, 80), disabled: b.disabled }))
        .slice(0, 25);
    }).catch(() => []);
    logger.info(`公開設定画面のボタン: ${JSON.stringify(publishPageButtons)}`);

    // デバッグ用スクリーンショット（公開直前）
    try {
      await page.screenshot({ path: resolve(config.paths.logs, 'before-publish.png'), fullPage: true });
      logger.info('公開直前のスクリーンショットを保存: logs/before-publish.png');
    } catch { /* ignore */ }

    // --- 「投稿する」をクリック ---
    logger.info('記事を投稿中...');

    // note.comの公開ボタンを探す
    // 実際のUI: 新規投稿→「公開」、編集→「更新する」（右上ボタン）
    const publishSelectors = [
      'button:text-is("公開")',
      'button:text-is("投稿")',
      'button:has-text("公開する")',
      'button:has-text("投稿する")',
      'button:has-text("更新する")',
      'button:has-text("公開")',
    ];

    let publishClicked = false;
    for (const sel of publishSelectors) {
      try {
        const btn = page.locator(sel).first();
        const isVisible = await btn.isVisible({ timeout: 5000 }).catch(() => false);
        if (!isVisible) continue;

        // ボタンがenabledになるまで待機
        for (let i = 0; i < 30; i++) {
          if (await btn.isEnabled()) break;
          await page.waitForTimeout(200);
        }

        const isEnabled = await btn.isEnabled();
        if (!isEnabled) {
          logger.warn(`ボタン「${sel}」は無効状態です。スキップ...`);
          continue;
        }

        await btn.click({ force: true });
        logger.info(`「${sel}」をクリックしました`);
        publishClicked = true;
        break;
      } catch (e) {
        logger.warn(`ボタン「${sel}」クリック失敗: ${e.message.slice(0, 80)}`);
      }
    }

    if (!publishClicked) {
      logger.warn('公開ボタンが見つかりませんでした');
      try {
        await page.screenshot({ path: resolve(config.paths.logs, 'publish-button-failed.png'), fullPage: true });
        logger.info('公開ボタン未検出のスクリーンショットを保存: logs/publish-button-failed.png');
      } catch { /* ignore */ }
    }

    // 投稿完了を待機（URL変更 or 「投稿しました」メッセージ）
    logger.info('投稿完了を待機中...');
    await Promise.race([
      page.waitForURL(url => {
        const urlStr = url.toString();
        return !urlStr.includes('/editor/') && !urlStr.includes('/publish') && !urlStr.includes('/edit');
      }, { timeout: 30000 }),
      page.locator('text=投稿しました').first().waitFor({ timeout: 20000 }),
      page.locator('text=公開しました').first().waitFor({ timeout: 20000 }),
      page.waitForTimeout(15000),
    ]).catch(() => {});

    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    const isPublished = !finalUrl.includes('/edit') && !finalUrl.includes('/publish') && !finalUrl.includes('/editor/');

    // 公開後のデバッグスクリーンショット
    try {
      await page.screenshot({ path: resolve(config.paths.logs, 'post-result.png'), fullPage: true });
      logger.info('投稿結果のスクリーンショットを保存: logs/post-result.png');
    } catch { /* ignore */ }

    if (isPublished) {
      logger.info(`投稿成功！記事URL: ${finalUrl}`);
    } else {
      logger.warn(`投稿が完了していない可能性があります。最終URL: ${finalUrl}`);

      // 確認ダイアログが表示されている可能性 → もう一度投稿ボタンを押す
      logger.info('確認ダイアログの有無を確認中...');
      const confirmBtns = [
        'button:has-text("投稿する")',
        'button:has-text("公開する")',
        'button:has-text("OK")',
        'button:has-text("はい")',
        '.ReactModalPortal button:has-text("投稿")',
        '.ReactModalPortal button:has-text("公開")',
      ];
      for (const sel of confirmBtns) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await btn.click({ force: true });
            logger.info(`確認ボタンをクリック: ${sel}`);
            await page.waitForTimeout(5000);
            break;
          }
        } catch {}
      }

      // 再度URLチェック
      const finalUrl2 = page.url();
      if (!finalUrl2.includes('/edit') && !finalUrl2.includes('/publish') && !finalUrl2.includes('/editor/')) {
        logger.info(`投稿成功（リトライ）！記事URL: ${finalUrl2}`);
      }
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
