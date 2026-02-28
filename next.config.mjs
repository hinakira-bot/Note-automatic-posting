/** @type {import('next').NextConfig} */
const nextConfig = {
  // 既存のNode.jsモジュールをサーバーコンポーネントで使用
  serverExternalPackages: ['playwright', 'sharp', 'pdf-parse', 'winston', 'node-cron'],
};

export default nextConfig;
