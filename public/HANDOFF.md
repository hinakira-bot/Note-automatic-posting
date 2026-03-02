# プロジェクト引き継ぎドキュメント

> 新しいチャットで「このファイルを読んで引き継いで」と伝えてください。
> パス: `C:\Users\oneok\Claud Code\note-auto-poster\HANDOFF.md`

---

## 1. プロジェクト概要

**Note自動投稿ツール** — Gemini AI + Google検索分析で高品質な記事を自動生成し、note.comに投稿するWeb UIベースのツール。

- **GitHub**: https://github.com/hinakira-bot/Note-automatic-posting
- **ローカルプロジェクト**: `C:\Users\oneok\Claud Code\note-auto-poster`
- **ベース**: アメブロ自動投稿ツール (`ameblo-auto-poster`) から派生
- **VPS**: Xserver VPS `220.158.22.9:3001`（PM2 で常時稼働）

---

## 2. 技術スタック

| カテゴリ | 技術 |
|---|---|
| フレームワーク | Next.js 16.1.6 (App Router, `'use client'`) |
| UI | Tailwind CSS v4 |
| AI（テキスト） | Google Gemini API (`@google/generative-ai`) — `gemini-3-flash-preview` |
| AI（画像） | Gemini Image Preview — `gemini-3.1-flash-image-preview` |
| ブラウザ自動化 | Playwright (Chromium headless) |
| スケジュール | カスタムcronチェッカー（server.mjs内、60秒間隔） |
| プロセス管理 | PM2 (`ecosystem.config.cjs`) |
| モジュール | ESM (`"type": "module"`) |
| Node.js | >= 18.0.0 |
| ログ | Winston |
| スクレイピング | Cheerio |

---

## 3. ファイル構成とアーキテクチャ

### エントリポイント

```
server.mjs                — カスタムNext.jsサーバー（Web UI + cronスケジューラー統合）
src/index.js              — CLI（commander.js）キーワード管理・テスト・セッション転送
src/instrumentation.js    — Next.js初期化フック（現在はログのみ）
src/middleware.js          — Basic認証ミドルウェア（WEB_USER/WEB_PASSWORD設定時のみ有効）
```

### コア処理（パイプライン）

```
src/pipeline.js            — パイプライン本体（キーワード→分析→生成→画像→投稿）
src/competitor-analyzer.js — Gemini + Google Search Grounding で競合分析 + 最新情報検索
src/content-generator.js   — 記事生成（4ステップ: 意図分析→アウトライン→タイトル→本文）
                            └ 後処理: 1文改段落 → プレーンURL変換 → メルマガCTA挿入
src/image-generator.js     — 画像生成（アイキャッチ + 各h2の図解、参照画像対応）
src/note-poster.js         — Playwright で note.com に投稿（ログイン、エディタ操作、画像アップ）
```

### データ管理

```
src/keyword-manager.js     — keywords.json のCRUD（ID, keyword, description, category, status）
src/knowledge-manager.js   — knowledge/ ディレクトリの .txt/.pdf ファイル管理
src/post-logger.js         — 投稿履歴（data/post-log.json）
src/settings-manager.js    — data/settings.json の読み書き（デフォルト値マージ）
src/prompt-manager.js      — プロンプトテンプレート管理（defaults/ → カスタム上書き方式）
src/config.js              — .env 読み込み + パス定義 + バリデーション
src/logger.js              — Winston ロガー
```

### Web UI共通

```
src/lib/pipeline-runner.js — パイプライン実行シングルトン（状態管理・SSE配信・排他制御・15分タイムアウト）
src/lib/schedule-helper.js — スケジュールユーティリティ
src/lib/credentials-manager.js — 資格情報管理
src/lib/interactive-session.js — 対話型セッション（スクリーンショット + クリック + 入力）
```

### Web UI (Next.js App Router)

```
src/app/
├── layout.js              — RootLayout（サイドバー + 設定チェック + パイプライン進捗）
├── page.js                — ダッシュボード（統計 + 手動投稿UI + 最近の投稿）
├── globals.css            — Tailwind CSSインポート
├── icon.svg               — ファビコン
├── keywords/page.js       — キーワード管理（追加/編集/削除/インポート/エクスポート）
├── knowledge/page.js      — ナレッジ管理（アップロード/プレビュー/削除）
├── prompts/page.js        — プロンプトテンプレート編集（Monaco風エディタ）
├── settings/page.js       — 設定（セッション管理、APIキー、記事設定、スケジュール、画像、参照画像）
├── setup/page.js          — 初回セットアップウィザード
└── logs/page.js           — 投稿ログ閲覧
```

### API Routes

```
src/app/api/
├── pipeline/route.js          — POST: パイプライン実行、GET: 状態取得
├── pipeline/stream/route.js   — SSE リアルタイム進捗ストリーム
├── keywords/route.js          — GET/POST キーワード一覧・追加
├── keywords/[id]/route.js     — PUT/DELETE キーワード更新・削除
├── keywords/export/route.js   — キーワードエクスポート
├── keywords/import/route.js   — キーワードインポート
├── knowledge/route.js         — GET/POST ナレッジ一覧・アップロード
├── knowledge/[filename]/route.js — GET/DELETE ナレッジ取得・削除
├── prompts/route.js           — GET プロンプト一覧
├── prompts/[name]/route.js    — GET/PUT/DELETE プロンプト取得・更新・リセット
├── settings/route.js          — GET/PUT 設定
├── credentials/route.js       — GET/POST APIキー・認証情報（.envに保存）
├── stats/route.js             — GET 統計
├── logs/route.js              — GET ログ取得
├── reference-images/route.js  — GET/POST/DELETE 参照画像管理
├── session/route.js           — GET/POST/DELETE 対話型セッション管理
├── session/screenshot/route.js — GET スクリーンショット取得
├── session/click/route.js     — POST 座標クリック
├── session/type/route.js      — POST テキスト入力
└── session/upload/route.js    — POST セッションファイル(state.json)アップロード
```

### プロンプトテンプレート

```
prompts/defaults/               — デフォルト（変更禁止、リセット用）
prompts/                        — ユーザーカスタム版（defaults/から上書きコピー）
├── article-search-intent.md    — 検索意図分析
├── article-outline.md          — 見出し構成生成（最新情報対応 {{latestNews}}）
├── article-title.md            — タイトル生成
├── article-body.md             — 本文生成（Note向けHTML、メルマガCTA禁止指示含む）
├── image-eyecatch.md           — アイキャッチ画像（3テキストパターン × 3スタイル）
├── image-diagram.md            — 図解画像（シンプル設計: 3-5要素上限）
└── image-screenshot.md         — スクリーンショット風画像
```

### データディレクトリ

```
data/
├── keywords.json              — キーワード一覧
├── post-log.json              — 投稿ログ
├── settings.json              — ユーザー設定
├── reference-images/          — 参照画像（eyecatch-*, diagram-* プレフィックス）
└── session/state.json         — Playwrightセッション
images/                        — 生成画像の一時保存
knowledge/                     — ナレッジファイル（.txt, .pdf）
logs/                          — Winstonログ
```

### インフラ

```
ecosystem.config.cjs           — PM2設定（note-tool, port 3001, fork mode, 512MB上限）
Dockerfile                     — Docker用
docker-compose.yml             — Docker Compose用
install.sh                     — ワンクリックインストーラー（Docker環境用）
docs/xserver-vps-setup.md      — Xserver VPS 完全セットアップガイド（15セクション）
```

---

## 4. パイプラインフロー

```
キーワード取得（ID指定 or 次の未投稿）
    ↓
ナレッジ読み込み（knowledge/ から全ファイル結合）
    ↓
競合分析（Gemini + Google Search Grounding → 上位記事分析 + heading直接取得）
    ↓
最新情報検索（Gemini + Google Search → 最新ニュース/トレンド/データ）
    ↓
記事生成（4ステップ）
  ├─ STEP 1: 検索意図分析（searchIntent, userNeeds, targetAudience）
  ├─ STEP 2: アウトライン生成（h2×4-6、各h2にh3×2-3、diagramDescription）
  ├─ STEP 3: タイトル生成（候補3つ+推奨選択）
  └─ STEP 4: 本文HTML生成 → 後処理
              ├─ splitSentencesToParagraphs() — 1文ずつ<p>タグ分割
              ├─ convertPlainUrlsToLinks()   — 生URLを<a>タグ化
              └─ insertNewsletterCTA()        — メルマガCTA挿入（h2前 + 末尾）
    ↓
画像生成
  ├─ アイキャッチ（参照画像マルチモーダル、タイトル短縮テキスト、3スタイル自動選択）
  └─ 各h2の図解（まとめスキップ、シンプル設計、参照画像対応）
    ↓
Note投稿（Playwright）
  ├─ ログイン（セッション復元 or メール+パスワード）
  ├─ エディタ操作（タイトル→カバー画像→本文→図解挿入）
  ├─ 公開フロー（ハッシュタグ→投稿ボタン）
  └─ セッション保存
    ↓
ステータス更新 + ログ記録
```

---

## 5. note.com 投稿の技術的詳細（note-poster.js）

### ブラウザ起動
- Chromium headless + Stealth対策（navigator.webdriver、chrome object、plugins偽装）
- セッション復元（`data/session/state.json` の storageState）
- User Agent: Chrome 131 Windows

### カバー画像アップロード（5段フォールバック）
1. **方法A**: 2ステップメニュー（カバーエリアクリック → ドロップダウン → 「画像をアップロード」）
2. **方法B**: 直接filechooserトリガー（旧UI互換）
3. **方法C**: SVGアイコン検索
4. **方法D**: hidden `input[type="file"]` 直接設定
5. **方法E**: API経由 `POST /api/v1/upload_image` → `eyecatch_image_key` 設定

### 本文挿入（3段フォールバック）
1. Clipboard paste（ClipboardEvent）
2. innerHTML直接設定
3. キーボード入力

### メルマガCTA自動挿入
- 最初の`<h2>`直前: 短いCTAリンク
- 記事末尾: 詳細CTA（登録特典リスト付き）
- URL: `https://hinakira.net/p/r/RwKLzKtX`

---

## 6. 画像生成の仕組み（image-generator.js）

### アイキャッチ画像
- `shortenTitle()` でタイトルを15文字以内に短縮
- 3テキストパターン（短縮タイトル / ツール名のみ / テキストなし）からAIが自動選択
- 3スタイルパターン（プロフェッショナル / おしゃれイラスト(キャラ入り) / テキスト+イラスト(キャラなし)）
- 参照画像があればマルチモーダル入力で雰囲気を合わせる

### 図解画像
- 各h2セクションの `diagramDescription` に基づいて生成
- シンプル設計（要素3-5個上限、1要素10文字以内）
- 4パターン: フロー図 / 比較図 / 構成図 / チェックリスト風
- 「まとめ」セクションはスキップ

### 参照画像
- `data/reference-images/` に保存
- `eyecatch-*` プレフィックス: アイキャッチ用参照
- `diagram-*` プレフィックス: 図解用参照
- 各タイプ最大3枚

---

## 7. コンテンツ生成の後処理パイプライン（content-generator.js）

```javascript
// STEP 4: 本文生成後の後処理
bodyHtml = splitSentencesToParagraphs(bodyHtml);  // 1文ずつ<p>タグに分割（スマホ読みやすさ）
bodyHtml = convertPlainUrlsToLinks(bodyHtml);      // プレーンURLを<a>テキストリンクに変換
bodyHtml = insertNewsletterCTA(bodyHtml);           // メルマガCTA挿入（h2前 + 末尾）
```

### splitSentencesToParagraphs
- `<p>`内の複数文（。！？で判定）を個別`<p>`に分割
- `<h2>`/`<h3>`直後の裸テキストも`<p>`で囲む

### convertPlainUrlsToLinks
- `<a>`タグ外のプレーンURLを `<a href="URL">こちらのリンク</a>` に変換
- `<a>`タグ内のURLはプレースホルダーで保護

### insertNewsletterCTA
- 短いCTA: 最初の`<h2>`直前に挿入
- 詳細CTA: 記事末尾に登録特典リスト付きで追加

---

## 8. VPS デプロイ情報

| 項目 | 値 |
|---|---|
| VPS | Xserver VPS |
| IP | `220.158.22.9` |
| ポート | `3001` |
| SSH | `ssh -i "C:\Users\oneok\.ssh\ameblo.pem" root@220.158.22.9` |
| ディレクトリ | `/opt/note-tool` |
| 実行ユーザー | `noteuser` |
| PM2 | noteuser の PM2 で `note-tool` プロセス管理 |
| エントリポイント | `server.mjs`（Next.js + cronスケジューラー統合） |

### デプロイコマンド

```bash
ssh -i "C:\Users\oneok\.ssh\ameblo.pem" root@220.158.22.9
cd /opt/note-tool
sudo -u noteuser git checkout -- .
sudo -u noteuser git pull origin main
sudo -u noteuser npm run build
sudo -u noteuser pm2 restart note-tool
```

### PM2 操作

```bash
sudo -u noteuser pm2 status          # ステータス確認
sudo -u noteuser pm2 logs note-tool  # ログ確認
sudo -u noteuser pm2 restart note-tool # 再起動
```

### VPS上のトラブルシューティング

```bash
# git pullがコンフリクトする場合
sudo -u noteuser git checkout -- .   # ローカル変更を破棄
sudo -u noteuser git clean -fd prompts/ knowledge/  # 未追跡ファイル削除

# PM2がnoteuser以外で起動した場合
# → root の PM2 ではなく noteuser の PM2 を使うこと
```

---

## 9. セッション管理

### ローカルで取得 → VPSに転送

```bash
# ローカル: セッションエクスポート
node src/index.js session-export -o session-backup.txt

# ファイル転送
scp session-backup.txt noteuser@220.158.22.9:/opt/note-tool/

# VPS: セッションインポート
node src/index.js session-import session-backup.txt
```

### Web UIから
設定ページ → セッション管理 → state.jsonアップロード

---

## 10. 設定体系

### .env（環境変数）
```
GEMINI_API_KEY=            # Google AI Studio APIキー
GEMINI_TEXT_MODEL=gemini-3-flash-preview
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
NOTE_EMAIL=                # note.comメールアドレス
NOTE_PASSWORD=             # note.comパスワード
CRON_SCHEDULE=0 9 * * *   # 自動投稿スケジュール
WEB_USER=                  # Web UI認証ユーザー名（VPS用）
WEB_PASSWORD=              # Web UI認証パスワード（VPS用）
DRY_RUN=false
LOG_LEVEL=info
```

### data/settings.json（Web UIから変更可能）
```json
{
  "article": {
    "minLength": 2000,
    "maxLength": 4000,
    "defaultCategory": "",
    "targetAudience": "",
    "defaultHashtags": ""
  },
  "knowledge": {
    "maxFileSizeKB": 500,
    "maxTotalChars": 10000
  },
  "posting": {
    "cronSchedule": "0 9 * * *",
    "dryRun": false
  }
}
```

---

## 11. 主な機能一覧

### 完成済み機能
- [x] Web UI（ダッシュボード、キーワード管理、ナレッジ管理、プロンプト編集、設定、ログ）
- [x] キーワード選択して手動投稿（ドロップダウン + 実行ボタン）
- [x] ドライラン（投稿せずにテスト実行）
- [x] SSEリアルタイム進捗表示（パイプラインの各ステップ）
- [x] Gemini + Google Search Grounding による競合分析
- [x] 最新情報検索（上位記事にない新情報を自動収集）
- [x] 4ステップ記事生成（意図分析→構成→タイトル→本文）
- [x] 本文後処理（1文改段落、URL変換、メルマガCTA自動挿入）
- [x] 画像生成（アイキャッチ: 3スタイル自動選択 + セクション図解: シンプル設計）
- [x] 参照画像アップロード（スタイル参考としてAI画像生成に反映）
- [x] カバー画像アップロード（5段フォールバック、API含む）
- [x] ナレッジファイル（文体・トーン・内容の参考資料）
- [x] プロンプトテンプレートのカスタマイズ（defaults → 上書き方式）
- [x] ログインセッション管理（storageState永続化 + export/import）
- [x] 対話型ログインセッション（Web UIからスクリーンショットベース操作）
- [x] Stealth対策（navigator.webdriver, chrome object, plugins偽装）
- [x] 自動投稿スケジュール（server.mjs統合、毎日/複数回/平日のみ設定可）
- [x] Basic認証（VPS用、WEB_USER/WEB_PASSWORD設定時のみ有効）
- [x] 初回セットアップウィザード
- [x] Docker対応（Dockerfile, docker-compose.yml, install.sh）
- [x] PM2でのプロセス管理
- [x] CLI（キーワード管理、テストコマンド、セッション転送等）
- [x] ハッシュタグ設定（settings.jsonから読み取り、投稿時に設定）
- [x] Xserver VPS完全セットアップガイド（15セクション）

---

## 12. 別ツール作成時の流用ガイド

このプロジェクトをベースに別のブログプラットフォーム向けツールを作る場合の指針。

### そのまま使えるモジュール（プラットフォーム非依存）

| ファイル | 内容 |
|---|---|
| `src/competitor-analyzer.js` | Gemini + Google Search 競合分析 |
| `src/content-generator.js` | 記事生成パイプライン（後処理は調整要） |
| `src/image-generator.js` | Gemini画像生成 |
| `src/keyword-manager.js` | キーワードCRUD |
| `src/knowledge-manager.js` | ナレッジ管理 |
| `src/settings-manager.js` | 設定管理 |
| `src/prompt-manager.js` | プロンプトテンプレート管理 |
| `src/post-logger.js` | 投稿ログ |
| `src/config.js` | 設定読み込み |
| `src/logger.js` | ロガー |
| `src/lib/pipeline-runner.js` | パイプライン実行管理（SSE配信付き） |
| `server.mjs` | Next.js + cronスケジューラー |
| `src/middleware.js` | Basic認証 |
| Web UI全般 | ダッシュボード・キーワード・ナレッジ・設定・ログ各ページ |

### プラットフォーム依存（要書き換え）

| ファイル | 変更内容 |
|---|---|
| `src/note-poster.js` | **全面書き換え** — 投稿先プラットフォームのPlaywright操作に変更 |
| `src/pipeline.js` | 投稿関数の呼び出し部分を変更 |
| `src/content-generator.js` | `insertNewsletterCTA()` の内容変更、HTML形式の調整 |
| `prompts/*` | プラットフォームに合わせたプロンプト調整 |
| `.env` / `config.js` | 認証情報の項目変更 |
| Web UI設定ページ | 認証フォームの変更 |

### 書き換え手順

1. プロジェクトをコピー or フォークして新リポジトリを作成
2. `src/note-poster.js` を複製して `src/xxx-poster.js` を作成
3. ログイン処理・エディタ操作・画像アップロード・公開フローを書き換え
4. `src/pipeline.js` の `import { postToNote }` を新しいposter関数に差し替え
5. `.env` に新プラットフォームの認証情報を追加
6. `src/config.js` に新しい環境変数の読み込みを追加
7. プロンプトテンプレートをプラットフォームに合わせて調整
8. `src/content-generator.js` の後処理（CTA内容、HTML形式）を調整
9. Web UIの設定ページ/セットアップウィザードの認証フォームを変更
10. テスト → ビルド → デプロイ

### 共通パターン・設計思想

- **シングルトンパイプライン**: `pipeline-runner.js` で排他制御（同時実行防止 + 15分タイムアウト）
- **SSEリアルタイム進捗**: `pipeline/stream/route.js` でフロントに進捗配信
- **プロンプトテンプレート方式**: `defaults/` に初期値、`prompts/` にユーザーカスタム（Handlebarsライクな `{{変数}}` + `{{#if}}` 構文）
- **参照画像マルチモーダル**: 画像生成時にユーザーアップロード画像をGeminiに渡してスタイル参考にする
- **セッション永続化**: Playwright の `storageState` でログイン状態を保持
- **後処理パイプライン**: AI生成テキストを正規表現で後処理（改段落、URL変換、CTA挿入）
- **設定の二重管理**: `.env`（環境変数: APIキー等の秘密情報）+ `data/settings.json`（Web UIから変更可能な設定）

---

## 13. 既知の課題・注意点

- note.com のエディタは ProseMirror ベースの React SPA。セレクタが変更される可能性あり
- VPSのIPからはreCAPTCHAが出る場合あり → ローカルでログイン→セッション転送で回避
- 本文中の図解画像挿入はエディタのUI操作に依存、note.com UI変更で要修正の可能性
- Next.js 16 で `middleware.js` が `proxy` に名称変更予定（現在は動作するが警告あり）
- カバー画像アップロードは5段フォールバックだが、note.comのUI変更で全て使えなくなる可能性あり

---

## 14. 環境情報

| 項目 | 値 |
|---|---|
| OS（ローカル） | Windows |
| OS（VPS） | Ubuntu（Xserver VPS） |
| Node.js | 20 LTS |
| パッケージマネージャ | npm |
| Git リモート | https://github.com/hinakira-bot/Note-automatic-posting |
| 最新コミット | main ブランチ（VPS同期済み） |

---

## 15. npm スクリプト

```bash
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npm run web          # プロダクションサーバー起動（next start）
npm run start        # CLIスケジューラー起動
npm run post         # 1回投稿実行
npm run post:dry     # ドライラン（投稿せずテスト）
npm run add          # キーワード追加
npm run list         # キーワード一覧
npm run test:gemini  # Gemini API接続テスト
npm run test:search  # Google検索テスト
npm run test:login   # note.comログインテスト
```

---

## 16. CLIコマンド一覧

```bash
node src/index.js start              # cronスケジューラー開始
node src/index.js post [--dry-run]   # 1回投稿
node src/index.js add "KW" -d "説明" # キーワード追加
node src/index.js add-file file.txt  # ファイルから一括追加
node src/index.js edit <id> -d "新説明" # キーワード編集
node src/index.js list [-s pending]  # キーワード一覧
node src/index.js knowledge-add file # ナレッジ追加
node src/index.js knowledge-list     # ナレッジ一覧
node src/index.js prompt-list        # プロンプト一覧
node src/index.js prompt-show <name> # プロンプト表示
node src/index.js prompt-edit <name> # プロンプト編集
node src/index.js prompt-reset <name># プロンプトリセット
node src/index.js config-show        # 設定表示
node src/index.js config-set <key> <value> # 設定変更
node src/index.js session-export [-o file] # セッションエクスポート
node src/index.js session-import <input>   # セッションインポート
node src/index.js test-gemini        # Gemini APIテスト
node src/index.js test-search [KW]   # Google検索テスト
node src/index.js test-login         # note.comログインテスト
```
