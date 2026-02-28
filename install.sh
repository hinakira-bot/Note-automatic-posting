#!/bin/bash
# ============================================
# Note自動投稿ツール - ワンクリックインストーラー
# 使い方: curl -fsSL https://raw.githubusercontent.com/hinakira-bot/Note-automatic-posting/main/install.sh | bash
# ============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Note自動投稿ツール インストーラー${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# --- Docker インストール確認 ---
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker をインストールしています...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl start docker
    systemctl enable docker
    echo -e "${GREEN}Docker インストール完了${NC}"
else
    echo -e "${GREEN}Docker: インストール済み${NC}"
fi

# --- Docker Compose 確認 ---
if ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}Docker Compose プラグインをインストールしています...${NC}"
    apt-get update && apt-get install -y docker-compose-plugin
    echo -e "${GREEN}Docker Compose インストール完了${NC}"
else
    echo -e "${GREEN}Docker Compose: インストール済み${NC}"
fi

# --- アプリのダウンロード ---
INSTALL_DIR="/opt/note-tool"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}既存のインストールを更新しています...${NC}"
    cd "$INSTALL_DIR"
    git pull
else
    echo -e "${YELLOW}アプリをダウンロードしています...${NC}"
    git clone https://github.com/hinakira-bot/Note-automatic-posting.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# --- .env ファイル作成 ---
if [ ! -f .env ]; then
    echo ""
    echo -e "${YELLOW}=== 初期設定 ===${NC}"
    echo ""

    read -p "Gemini APIキー: " GEMINI_KEY
    read -p "Noteメールアドレス: " NOTE_EMAIL
    read -p "Noteパスワード: " NOTE_PASS

    cat > .env << EOF
GEMINI_API_KEY=${GEMINI_KEY}
GEMINI_TEXT_MODEL=gemini-3-flash-preview
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview
NOTE_EMAIL=${NOTE_EMAIL}
NOTE_PASSWORD=${NOTE_PASS}
CRON_SCHEDULE=0 9 * * *
POST_CATEGORY=
ARTICLE_MIN_LENGTH=2000
ARTICLE_MAX_LENGTH=4000
DRY_RUN=false
LOG_LEVEL=info
EOF

    echo -e "${GREEN}.env ファイルを作成しました${NC}"
else
    echo -e "${GREEN}.env: 既存の設定を使用${NC}"
fi

# --- データディレクトリ作成 ---
mkdir -p data logs images knowledge data/session

# --- Docker ビルド & 起動 ---
echo ""
echo -e "${YELLOW}Docker イメージをビルドしています（初回は数分かかります）...${NC}"
docker compose up -d --build

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  インストール完了！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "管理画面: ${GREEN}http://$(hostname -I | awk '{print $1}'):3000${NC}"
echo ""
echo -e "便利なコマンド:"
echo -e "  ログ確認:     ${YELLOW}cd $INSTALL_DIR && docker compose logs -f${NC}"
echo -e "  再起動:       ${YELLOW}cd $INSTALL_DIR && docker compose restart${NC}"
echo -e "  停止:         ${YELLOW}cd $INSTALL_DIR && docker compose down${NC}"
echo -e "  アップデート: ${YELLOW}cd $INSTALL_DIR && git pull && docker compose up -d --build${NC}"
echo ""
echo -e "${RED}※ ファイアウォール/パケットフィルターでポート3000を開放してください${NC}"
