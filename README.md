# Note 自動投稿ツール

Gemini AI を使って SEO に強いブログ記事を自動生成し、note.com に自動投稿するツールです。

## 機能

- **AI記事生成** - Gemini で競合分析→見出し構成→本文→タイトルを自動生成
- **AI画像生成** - アイキャッチ画像・図解画像を自動生成（別プロンプト設定可）
- **自動投稿** - Playwright で note.com に自動ログイン・投稿
- **Web UI** - ブラウザから全機能を操作（ダッシュボード・キーワード管理・設定など）
- **CLI** - コマンドラインからも操作可能
- **スケジュール投稿** - 毎日・平日のみ・1日2回など柔軟に設定
- **ナレッジ管理** - テキスト/PDFをアップロードして記事生成の参考資料に
- **プロンプトカスタマイズ** - 記事6種+画像2種のテンプレートを自由に編集

## 動作要件

- **Node.js 18以上**
- **OS**: Windows / macOS / Linux
- **Gemini APIキー**（[Google AI Studio](https://aistudio.google.com/apikey) で無料取得）
- **note.com アカウント**

> ⚠️ **Vercel・Netlify等のサーバーレス環境では動作しません。**
> Playwright（ブラウザ自動操作）とファイル書き込みが必要なため、
> ローカルPC または VPS で実行してください。

---

## クイックスタート（ローカルPC）

```bash
# 1. クローン
git clone https://github.com/hinakira-bot/Note-automatic-posting.git
cd Note-automatic-posting

# 2. インストール
npm install
npx playwright install chromium

# 3. Web UIを起動
npm run dev
# → http://localhost:3000 にアクセス
# → 初回は自動でセットアップ画面が表示されます
```

セットアップ画面で以下を入力するだけで使えます：
- Gemini APIキー
- Note メールアドレス・パスワード

---

## Docker でのセットアップ（推奨）

VPS に SSH 接続後、以下の1コマンドで全自動インストールできます：

```bash
curl -fsSL https://raw.githubusercontent.com/hinakira-bot/Note-automatic-posting/main/install.sh | bash
```

対話形式で Gemini APIキー・Noteメールアドレス/パスワードを入力すれば、自動でセットアップが完了します。

### Docker 手動セットアップ

```bash
# クローン
git clone https://github.com/hinakira-bot/Note-automatic-posting.git /opt/note-tool
cd /opt/note-tool

# .env を作成して設定を入力
cp .env.example .env
nano .env

# 起動
docker compose up -d --build
```

### Docker コマンド一覧

```bash
docker compose logs -f        # ログ確認
docker compose restart         # 再起動
docker compose down            # 停止
git pull && docker compose up -d --build  # アップデート
```

---

## VPS へのデプロイ（Docker なし）

### 推奨VPS

| サービス | 最低プラン | 月額目安 |
|---------|-----------|---------|
| Xserver VPS | 2GB | ¥830〜 |
| ConoHa VPS | 1GB | ¥750〜 |
| さくらVPS | 1GB | ¥880〜 |
| AWS Lightsail | 1GB | $5〜 |

Ubuntu 22.04 以上を推奨。

### 1. サーバー初期設定

```bash
# SSH接続
ssh root@your-server-ip

# Node.js インストール（v20推奨）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Playwright の依存パッケージ
sudo npx playwright install-deps chromium

# PM2（プロセスマネージャー）
sudo npm install -g pm2
```

### 2. アプリのデプロイ

```bash
# クローン
cd /opt
git clone https://github.com/hinakira-bot/Note-automatic-posting.git note-tool
cd note-tool

# インストール
npm install
npx playwright install chromium

# ビルド（本番用）
npm run build
```

### 3. 環境変数の設定

```bash
# .envファイルを作成
cp .env.example .env
nano .env
```

`.env` に以下を入力して保存（Ctrl+X → Y → Enter）：

```
GEMINI_API_KEY=AIzaSy...あなたのキー
NOTE_EMAIL=あなたのメールアドレス
NOTE_PASSWORD=あなたのパスワード
```

> もしくは Web UI のセットアップ画面からも設定できます。

### 4. PM2 で常時起動

```bash
# 起動（ポート3000）
pm2 start ecosystem.config.cjs

# 自動起動設定（サーバー再起動時も自動復帰）
pm2 startup
pm2 save

# 動作確認
pm2 status
pm2 logs note-tool
```

### 5. ポート開放・アクセス

```bash
# ファイアウォール設定
sudo ufw allow 3000

# アクセス
# → http://your-server-ip:3000
```

#### （任意）Nginx リバースプロキシ + ドメイン設定

```bash
sudo apt install nginx -y

sudo tee /etc/nginx/sites-available/note-tool > /dev/null << 'NGINX'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/note-tool /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS が必要な場合は Let's Encrypt を追加：
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

### 6. アップデート方法

```bash
cd /opt/note-tool
git pull
npm install
npm run build
pm2 restart note-tool
```

---

## CLI の使い方

Web UI を使わず、コマンドラインからも操作できます。

```bash
# 初期設定（対話式）
npm run setup

# キーワード追加
npm run add "副業 在宅ワーク 始め方"

# キーワード一覧
npm run list

# 1回投稿（ドライラン）
npm run post:dry

# 1回投稿（本番）
npm run post

# 自動投稿開始（cronスケジュール）
npm run start

# テスト
npm run test:gemini    # Gemini API接続テスト
npm run test:search    # 競合分析テスト
npm run test:login     # Noteログインテスト
```

---

## ディレクトリ構成

```
├── src/
│   ├── app/              # Next.js Web UI
│   │   ├── api/          # APIルート（11エンドポイント）
│   │   ├── keywords/     # キーワード管理ページ
│   │   ├── knowledge/    # ナレッジ管理ページ
│   │   ├── prompts/      # プロンプト編集ページ
│   │   ├── settings/     # 設定ページ
│   │   ├── setup/        # 初回セットアップ
│   │   └── logs/         # 投稿ログページ
│   ├── components/       # UIコンポーネント
│   ├── lib/              # ユーティリティ
│   ├── index.js          # CLIエントリーポイント
│   ├── pipeline.js       # 投稿パイプライン
│   ├── content-generator.js  # AI記事生成
│   ├── image-generator.js    # AI画像生成
│   ├── competitor-analyzer.js # 競合分析
│   └── note-poster.js       # Note投稿
├── prompts/defaults/     # プロンプトテンプレート
├── knowledge/            # ナレッジファイル
├── data/                 # データ（キーワード・ログ・設定）
├── images/               # 生成画像
└── logs/                 # アプリログ
```

---

## ライセンス

Private - All rights reserved
