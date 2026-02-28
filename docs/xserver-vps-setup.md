# Xserver VPS セットアップガイド

Note自動投稿ツールを Xserver VPS で動かすための完全手順です。

---

## 目次

1. [Xserver VPS の申し込み](#1-xserver-vps-の申し込み)
2. [SSH 接続](#2-ssh-接続)
3. [サーバー初期設定](#3-サーバー初期設定)
4. [Node.js インストール](#4-nodejs-インストール)
5. [ツールのデプロイ](#5-ツールのデプロイ)
6. [PM2 で常時起動](#6-pm2-で常時起動)
7. [ポート開放（パケットフィルター）](#7-ポート開放パケットフィルター)
8. [動作確認](#8-動作確認)
9. [Nginx + ドメイン設定（任意）](#9-nginx--ドメイン設定任意)
10. [HTTPS 化（任意）](#10-https-化任意)
11. [アップデート方法](#11-アップデート方法)
12. [トラブルシューティング](#12-トラブルシューティング)

---

## 1. Xserver VPS の申し込み

### プラン選択

https://vps.xserver.ne.jp/ にアクセスして申し込み。

| プラン | メモリ | 月額（税込） | 備考 |
|-------|--------|------------|------|
| **2GB** | 2GB | ¥830〜 | **推奨（これで十分）** |
| 4GB | 4GB | ¥1,700〜 | 余裕を持たせたい場合 |

### OS 選択

申し込み時に以下を選択：

- **OS**: `Ubuntu 22.04` または `Ubuntu 24.04`
- **アプリケーション**: なし（素のUbuntu）
- **rootパスワード**: 安全なものを設定（後で使います）

### SSH鍵の登録

申し込み時に「SSH Key」を登録するオプションがあります。

**パターンA: Xserver側で生成**
1. 「自動生成」を選択
2. 秘密鍵（.pem ファイル）がダウンロードされる → 大切に保管

**パターンB: 自分の鍵を登録**
1. ローカルPCで鍵を生成（まだ持っていない場合）：
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/xserver_vps
   ```
2. 公開鍵（`~/.ssh/xserver_vps.pub`）の内容をコピーして登録

---

## 2. SSH 接続

### IPアドレスの確認

Xserver VPSパネル → サーバー情報 → 「IPアドレス」をメモ

### SSH接続

```bash
# パターンA（Xserverで鍵を生成した場合）
chmod 600 ~/Downloads/秘密鍵ファイル名.pem
ssh -i ~/Downloads/秘密鍵ファイル名.pem root@あなたのIPアドレス

# パターンB（自分の鍵の場合）
ssh -i ~/.ssh/xserver_vps root@あなたのIPアドレス
```

### Windows の場合

PowerShell またはコマンドプロンプトから：
```powershell
ssh -i C:\Users\あなたのユーザー名\.ssh\秘密鍵ファイル名 root@あなたのIPアドレス
```

> TeraTerm や PuTTY でもOKです。

接続できたら `Welcome to Ubuntu` のようなメッセージが表示されます。

---

## 3. サーバー初期設定

### パッケージ更新

```bash
apt update && apt upgrade -y
```

### 作業ユーザー作成（推奨）

rootで直接作業するのはセキュリティ上避けるべきなので、専用ユーザーを作成します。

```bash
# ユーザー作成
adduser noteuser
# パスワードを設定、他の質問はEnterでスキップ

# sudo権限を付与
usermod -aG sudo noteuser

# SSH鍵をコピー
mkdir -p /home/noteuser/.ssh
cp ~/.ssh/authorized_keys /home/noteuser/.ssh/
chown -R noteuser:noteuser /home/noteuser/.ssh
chmod 700 /home/noteuser/.ssh
chmod 600 /home/noteuser/.ssh/authorized_keys

# 以降はこのユーザーで作業
su - noteuser
```

---

## 4. Node.js インストール

### Node.js 20 LTS をインストール

```bash
# NodeSourceリポジトリ追加
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# インストール
sudo apt-get install -y nodejs

# バージョン確認
node -v   # → v20.x.x
npm -v    # → 10.x.x
```

### Playwright の依存パッケージ

Playwright（ブラウザ自動操作）に必要なシステムライブラリをインストール：

```bash
sudo npx playwright install-deps chromium
```

### PM2（プロセスマネージャー）

```bash
sudo npm install -g pm2
```

---

## 5. ツールのデプロイ

### Git クローン

```bash
# /opt にデプロイ
sudo mkdir -p /opt/note-tool
sudo chown noteuser:noteuser /opt/note-tool

git clone https://github.com/hinakira-bot/Note-automatic-posting.git /opt/note-tool
cd /opt/note-tool
```

### 依存パッケージインストール

```bash
npm install
npx playwright install chromium
```

### ビルド

```bash
npm run build
```

> ビルドに1〜2分かかります。「Creating an optimized production build」→「✓ Compiled successfully」と表示されればOK。

### 環境変数の設定

**方法A: Web UIから設定（推奨）**

先に起動して、ブラウザからセットアップウィザードで入力できます。→ 手順7のポート開放後に行ってください。

**方法B: コマンドラインで設定**

```bash
cp .env.example .env
nano .env
```

以下を編集して保存（Ctrl+X → Y → Enter）：

```
GEMINI_API_KEY=AIzaSy...あなたのGemini APIキー
NOTE_EMAIL=あなたのメールアドレス
NOTE_PASSWORD=あなたのパスワード
```

---

## 6. PM2 で常時起動

### 起動

```bash
cd /opt/note-tool
pm2 start ecosystem.config.cjs
```

### 自動起動設定

サーバー再起動時にも自動で復帰するようにします：

```bash
pm2 startup
# 表示されたコマンドをコピーして実行（sudo ... の行）

pm2 save
```

### 動作確認コマンド

```bash
# ステータス確認
pm2 status

# ログ確認
pm2 logs note-tool

# 再起動
pm2 restart note-tool

# 停止
pm2 stop note-tool
```

---

## 7. ポート開放（パケットフィルター）

Xserver VPS はデフォルトで外部からのアクセスが制限されています。
Web UIにアクセスするためにポートを開放します。

### 手順

1. **Xserver VPSパネル** ( https://secure.xserver.ne.jp/xapanel/login/xvps/ ) にログイン
2. 対象サーバーの **「パケットフィルター設定」** をクリック
3. パケットフィルターが **「OFF」** の場合 → **「ON」** に変更
4. **「フィルタールール追加」** をクリック
5. 以下を設定：

| 項目 | 設定値 |
|------|--------|
| プロトコル | TCP |
| ポート番号 | `3000`（単一ポート） |
| 許可する通信元IPアドレス | すべて許可 ※ |

6. **「追加」** → **「変更する」** をクリック

> ※ セキュリティを高めたい場合は、自分のIPアドレスのみ許可にすることもできます。

### SSH用のルールも忘れずに

SSH接続用のポート22も開放されていることを確認：

| プロトコル | ポート | 通信元 |
|-----------|--------|--------|
| TCP | 22 | すべて許可 |
| TCP | 3000 | すべて許可 |

---

## 8. 動作確認

### ブラウザでアクセス

```
http://あなたのIPアドレス:3000
```

初回アクセスでセットアップウィザードが表示されます：

1. **ようこそ画面** → 「セットアップを始める」
2. **Gemini APIキー入力** → Google AI Studio で取得したキーを入力
3. **Noteメールアドレス・パスワード入力** → note.comのログイン情報を入力
4. **完了** → ダッシュボードへ

### 確認ポイント

- ダッシュボードが表示される
- 設定ページでAPIキーがマスク表示される
- キーワードを追加できる

---

## 9. Nginx + ドメイン設定（任意）

ドメイン名でアクセスしたい場合、Nginx をリバースプロキシとして設定します。

### Nginx インストール

```bash
sudo apt install nginx -y
```

### 設定ファイル作成

```bash
sudo nano /etc/nginx/sites-available/note-tool
```

以下を貼り付け（`your-domain.com` を自分のドメインに置換）：

```nginx
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
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # SSE（リアルタイム進捗）用
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
```

### 有効化と再起動

```bash
sudo ln -s /etc/nginx/sites-available/note-tool /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### DNS設定

ドメインのDNS設定で、AレコードをVPSのIPアドレスに向けてください。

### パケットフィルターに80番ポートを追加

VPSパネルで以下のルールも追加：

| プロトコル | ポート | 通信元 |
|-----------|--------|--------|
| TCP | 80 | すべて許可 |

---

## 10. HTTPS 化（任意）

Let's Encrypt で無料SSL証明書を設定：

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

パケットフィルターに443番ポートを追加：

| プロトコル | ポート | 通信元 |
|-----------|--------|--------|
| TCP | 443 | すべて許可 |

証明書は自動更新されます。確認：
```bash
sudo certbot renew --dry-run
```

---

## 11. アップデート方法

新しいバージョンがリリースされた場合：

```bash
cd /opt/note-tool

# コードを更新
git pull

# 依存パッケージ更新
npm install

# 再ビルド
npm run build

# 再起動
pm2 restart note-tool
```

---

## 12. トラブルシューティング

### サイトにアクセスできない

```bash
# PM2が動いているか確認
pm2 status

# ポート3000でリスンしているか確認
sudo ss -tlnp | grep 3000

# ファイアウォール確認
sudo ufw status
```

→ VPSパネルのパケットフィルターでポート3000が開放されているか確認

### Playwright エラー

```bash
# 依存ライブラリの再インストール
sudo npx playwright install-deps chromium
npx playwright install chromium
```

### メモリ不足

```bash
# メモリ使用量確認
free -h

# スワップ追加（2GBプランの場合推奨）
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### ログの確認

```bash
# アプリログ
pm2 logs note-tool

# 直近のエラーのみ
pm2 logs note-tool --err --lines 50

# Nginx ログ（ドメイン設定時）
sudo tail -f /var/log/nginx/error.log
```

### PM2 が起動しない

```bash
# 環境変数が読み込まれているか確認
cd /opt/note-tool
cat .env

# 手動で起動テスト
node_modules/.bin/next start -p 3000
# Ctrl+C で停止後、PM2で再起動
pm2 restart note-tool
```

---

## 13. セッション転送（ローカル → VPS）

VPSのheadlessブラウザではnote.comのCAPTCHAが出る場合があります。
ローカルPCでログインしたセッションをVPSに転送することで回避できます。

### ローカルPCで実行

```bash
cd C:\Users\あなた\note-auto-poster

# セッションをBase64テキストとしてエクスポート
node src/index.js session-export -o session-backup.txt
```

### VPSに転送 & インポート

```bash
# ファイルをVPSに転送
scp session-backup.txt noteuser@あなたのIP:/opt/note-tool/

# VPS側でインポート
ssh noteuser@あなたのIP
cd /opt/note-tool
node src/index.js session-import session-backup.txt

# 不要なファイルを削除
rm session-backup.txt
```

> セッションの有効期限が切れたら、ローカルで `npm run test:login` して再度転送してください。

---

## 14. Web UI 認証設定

VPS運用時は外部からWeb UIにアクセスできるため、Basic認証を設定してください。

### 設定方法

`.env` に以下を追加：

```
WEB_USER=admin
WEB_PASSWORD=あなたの安全なパスワード
```

設定後に再起動：

```bash
pm2 restart note-tool
```

> `WEB_USER` と `WEB_PASSWORD` が両方設定されている場合のみ認証が有効になります。
> ローカル開発時は空欄でOKです。

---

## 15. 自動投稿スケジュール

PM2でNext.jsを起動すると、サーバー起動時にcronスケジューラーが自動開始されます。
`.env` の `CRON_SCHEDULE` で投稿時刻を設定できます。

```
# 毎日9時に投稿
CRON_SCHEDULE=0 9 * * *

# 毎日9時と15時に投稿
CRON_SCHEDULE=0 9,15 * * *

# 平日のみ10時に投稿
CRON_SCHEDULE=0 10 * * 1-5
```

Web UIの「設定」ページからも変更可能です。

### 動作確認

PM2のログで以下が表示されていればOK：

```bash
pm2 logs note-tool --lines 5
# → [cron] 自動投稿スケジュール開始: 0 9 * * *
```

---

## 費用まとめ

| 項目 | 費用 |
|------|------|
| Xserver VPS 2GB | ¥830/月〜 |
| Gemini API | 無料枠あり |
| ドメイン（任意） | ¥1,000/年〜 |
| SSL証明書（任意） | 無料（Let's Encrypt） |

**最低 ¥830/月 で24時間自動投稿環境が構築できます。**
