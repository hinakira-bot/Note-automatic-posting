# ============================================
# Note自動投稿ツール - Docker イメージ
# ============================================

# --- ステージ1: ビルド ---
FROM node:20-slim AS builder

WORKDIR /app

# 依存関係のインストール
COPY package.json package-lock.json* ./
RUN npm ci

# ソースコードをコピーしてビルド
COPY . .
RUN npm run build

# --- ステージ2: 本番 ---
FROM node:20-slim AS runner

# Playwright用の依存ライブラリをインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libwayland-client0 \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 本番依存関係のみインストール
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Playwright Chromiumをインストール
RUN npx playwright install chromium

# ビルド成果物をコピー
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src ./src
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder /app/ecosystem.config.cjs ./ecosystem.config.cjs
COPY --from=builder /app/.env.example ./.env.example

# データ・ログ・画像・ナレッジ用ディレクトリ（ボリュームマウント用）
RUN mkdir -p data logs images knowledge data/session

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Next.js 本番サーバー起動
CMD ["npx", "next", "start", "-p", "3000"]
