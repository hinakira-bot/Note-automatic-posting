# プロジェクト引き継ぎドキュメント

> 新しいチャットで「このファイルを読んで引き継いで」と伝えてください。
> パス: `C:\Users\oneok\Claud Code\note-auto-poster\HANDOFF.md`

---

## 1. プロジェクト概要

**Note自動投稿ツール** — Gemini AI + Google検索分析で高品質な記事を自動生成・note.comに投稿するWeb UIベースのツール。

- **GitHub**: https://github.com/hinakira-bot/Note-automatic-posting
- **ローカルプロジェクト**: `C:\Users\oneok\Claud Code\note-auto-poster`
- **ベース**: アメブロ自動投稿ツール (`ameblo-auto-poster`) から派生

---

## 2. 技術スタック

| カテゴリ | 技術 |
|---|---|
| フレームワーク | Next.js 16 (App Router, `'use client'`) |
| UI | Tailwind CSS v4 |
| AI | Google Gemini API (`@google/generative-ai`) |
| テキストモデル | `gemini-3-flash-preview` |
| 画像モデル | `gemini-3.1-flash-image-preview` (設定で変更可) |
| ブラウザ自動化 | Playwright (Chromium) |
| スケジュール | node-cron |
| プロセス管理 | PM2 |
| モジュール | ESM (`"type": "module"`) |
| Node.js | >= 18.0.0 |

---

## 3. ファイル構成とアーキテクチャ

### コア処理（パイプライン）

```
src/pipeline.js          — パイプライン本体（キーワード→分析→生成→画像→投稿）
src/competitor-analyzer.js — Gemini + Google Search で競合分析 + 最新情報検索
src/content-generator.js  — 記事生成（意図分析→アウトライン→タイトル→本文の4ステップ）
src/image-generator.js    — 画像生成（アイキャッチ + 各h2の図解、参照画像対応）
src/note-poster.js        — Playwright で note.com に投稿（ログイン、エディタ操作、画像アップ）
```

### データ管理

```
src/keyword-manager.js    — keywords.json のCRUD（ID, keyword, description, category, status）
src/knowledge-manager.js  — knowledge/ ディレクトリの .txt/.pdf ファイル管理
src/post-logger.js        — 投稿履歴（data/post-log.json）
src/settings-manager.js   — data/settings.json の読み書き
src/prompt-manager.js     — プロンプトテンプレート管理（defaults/ → カスタム上書き）
src/config.js             — .env 読み込み + パス定義
src/logger.js             — Winston ロガー
```

### Web UI (Next.js App Router)

```
src/app/
├── layout.js             — RootLayout（サイドバー + 設定チェック + パイプライン進捗）
├── page.js               — ダッシュボード（統計 + 手動投稿UI + 最近の投稿）
├── icon.svg              — ファビコン
├── globals.css           — Tailwind CSSインポート
├── keywords/page.js      — キーワード管理（追加/編集/削除/ステータス表示）
├── knowledge/page.js     — ナレッジ管理（アップロード/プレビュー/削除）
├── prompts/page.js       — プロンプトテンプレート編集
├── settings/page.js      — 設定ページ（セッション管理、APIキー、記事設定、スケジュール、画像生成、参照画像）
├── setup/page.js         — 初回セットアップウィザード
└── logs/page.js          — ログ閲覧
```

### API Routes

```
src/app/api/
├── pipeline/route.js     — POST: パイプライン実行（keywordId, dryRun対応）、GET: 状態取得
├── pipeline/stream/route.js — SSE リアルタイム進捗ストリーム
├── keywords/route.js     — GET/POST キーワード一覧・追加
├── keywords/[id]/route.js — PUT/DELETE キーワード更新・削除
├── knowledge/route.js    — GET/POST ナレッジ一覧・アップロード
├── knowledge/[filename]/route.js — GET/DELETE ナレッジ取得・削除
├── prompts/route.js      — GET プロンプト一覧
├── prompts/[name]/route.js — GET/PUT/DELETE プロンプト取得・更新・リセット
├── settings/route.js     — GET/PUT 設定
├── credentials/route.js  — GET/POST APIキー・認証情報（.envに保存）
├── stats/route.js        — GET 統計
├── logs/route.js         — GET ログ取得
├── reference-images/route.js — GET/POST/DELETE 参照画像管理
├── session/route.js      — GET/POST/DELETE 対話型セッション管理
├── session/screenshot/route.js — GET スクリーンショット取得
├── session/click/route.js — POST 座標クリック
├── session/type/route.js  — POST テキスト入力/キー入力
└── session/upload/route.js — POST セッションファイル(state.json)アップロード
```

### コンポーネント

```
src/components/
├── Sidebar.js            — サイドバーナビ + 投稿実行ボタン
├── PipelineProgress.js   — SSEベースのリアルタイムパイプライン進捗表示
├── StatusBadge.js        — ステータスバッジ（posted/failed/pending）
└── Modal.js              — モーダルコンポーネント
```

### プロンプトテンプレート

```
prompts/defaults/
├── article-search-intent.md — 検索意図分析
├── article-outline.md       — 見出し構成生成（最新情報対応 {{latestNews}}）
├── article-title.md         — タイトル生成
├── article-body.md          — 本文生成（Note向けHTML）
├── image-eyecatch.md        — アイキャッチ画像生成指示
└── image-diagram.md         — 図解画像生成指示
```

---

## 4. パイプラインフロー

```
キーワード取得（ID指定 or 次の未投稿）
    ↓
ナレッジ読み込み（knowledge/ から全ファイル結合）
    ↓
競合分析（Gemini + Google Search Grounding → 上位5-10記事分析 → 上位3記事のHeading直接取得）
    ↓
【最新情報検索】（Gemini + Google Search → 最新ニュース/トレンド/データ取得）
    ↓
記事生成
  ├─ STEP 1: 検索意図分析（searchIntent, userNeeds, targetAudience）
  ├─ STEP 2: アウトライン生成（h2×4-6、各h2にh3×2-3、diagramDescription）
  ├─ STEP 3: タイトル生成（候補+推奨選択）
  └─ STEP 4: 本文HTML生成（最新情報・ナレッジ・競合データ反映）
    ↓
画像生成
  ├─ アイキャッチ（参照画像があればマルチモーダル入力）
  └─ 各h2の図解（まとめセクションはスキップ、参照画像対応）
    ↓
Note投稿（Playwright: ログイン→エディタ→タイトル→カバー画像→本文→公開→ハッシュタグ→投稿）
    ↓
ステータス更新 + ログ記録
```

---

## 5. note.com 投稿フロー（note-poster.js）

```
1. ブラウザ起動（Stealth対策込み）
2. note.com/login でメール+パスワードログイン
3. editor.note.com/new へ遷移
4. タイトル入力
5. カバー画像アップロード（filechooserイベント + トリミングダイアログ）
6. 本文HTML挿入（clipboard paste → innerHTML → keyboard の3段フォールバック）
7. 各h2の後に図解画像を挿入
8. 「公開に進む」クリック
9. ハッシュタグ設定（combobox入力）
10. 「投稿する」クリック
11. セッション保存（storageState）
```

---

## 6. 主な機能一覧

### 完成済み機能
- [x] Web UI（ダッシュボード、キーワード管理、ナレッジ管理、プロンプト編集、設定、ログ）
- [x] キーワード選択して手動投稿（ダッシュボードのドロップダウン + 実行ボタン）
- [x] ドライラン（投稿せずにテスト実行）
- [x] SSEリアルタイム進捗表示（パイプラインの各ステップ）
- [x] Gemini + Google Search による競合分析
- [x] 最新情報検索（上位記事にない新情報を自動収集）
- [x] 4ステップ記事生成（意図分析→構成→タイトル→本文）
- [x] 画像生成（アイキャッチ + セクション図解）
- [x] 参照画像アップロード（スタイル参考としてAI画像生成に反映）
- [x] ナレッジファイル（文体・トーン・内容の参考資料）
- [x] プロンプトテンプレートのカスタマイズ（defaults → 上書き方式）
- [x] ログインセッション管理（storageState永続化）
- [x] 対話型ログインセッション（スクリーンショットベース操作）
- [x] Stealth対策（navigator.webdriver, chrome object, plugins偽装）
- [x] 自動投稿スケジュール（毎日1回/2回/平日のみ、時刻設定可能）
- [x] 初回セットアップウィザード
- [x] Docker対応（Dockerfile, docker-compose.yml）
- [x] PM2でのプロセス管理
- [x] CLI（キーワード追加、投稿実行、テストコマンド等）

---

## 7. 既知の課題・注意点

- note.com のエディタは React SPA（contenteditable div）のため、セレクタが変更される可能性がある
- VPSのIPからはreCAPTCHAが出る可能性があるため、ローカルPCでログイン→セッションアップロードが必要な場合がある
- 本文中の図解画像挿入はエディタのUI操作に依存しており、note.com のUI変更で要修正の可能性あり

---

## 8. 環境情報

| 項目 | 値 |
|---|---|
| OS（ローカル） | Windows |
| Node.js | 18+ |
| パッケージマネージャ | npm |
| Git リモート | https://github.com/hinakira-bot/Note-automatic-posting |
