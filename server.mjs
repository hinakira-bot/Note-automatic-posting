/**
 * カスタムサーバー: Next.js Web UI + 自動投稿スケジューラー
 *
 * Next.js 16 の instrumentation.js 内の setInterval / node-cron は
 * production cluster モードで持続しないため、
 * カスタムサーバーでスケジューラーを同一プロセス内で動かす。
 */
import { createServer } from 'http';
import next from 'next';
import { loadSettings } from './src/settings-manager.js';

const port = parseInt(process.env.PORT || '3001', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, port });
const handle = app.getRequestHandler();

// === スケジューラー ===
let lastRunKey = '';

async function checkSchedule() {
  try {
    // 遅延import（起動時にpipeline-runnerが準備完了してから）
    const { startPipeline, getStatus } = await import('./src/lib/pipeline-runner.js');
    const settings = loadSettings();
    const cronExpr = settings.posting?.cronSchedule || '0 9 * * *';

    const now = new Date();
    const minute = now.getMinutes();
    const hour = now.getHours();
    const dow = now.getDay();
    const runKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${hour}-${minute}`;

    if (runKey === lastRunKey) return;

    // ";"区切りの複数スケジュール対応
    const schedules = cronExpr.split(';').map(s => s.trim()).filter(Boolean);
    const matched = schedules.some(s => shouldRun(s, minute, hour, dow));
    if (!matched) return;

    const status = getStatus();
    if (status.running) {
      console.log('[scheduler] パイプライン実行中のためスキップ');
      return;
    }

    lastRunKey = runKey;
    console.log(`[scheduler] --- スケジュール実行開始 (${hour}:${String(minute).padStart(2, '0')}) ---`);

    const dryRun = settings.posting?.dryRun ?? false;
    await startPipeline({ dryRun });

    console.log('[scheduler] --- スケジュール実行完了 ---');
  } catch (err) {
    console.error(`[scheduler] エラー: ${err.message}`);
  }
}

function shouldRun(cronExpr, minute, hour, dow) {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [cronMin, cronHour, , , cronDow] = parts;
  return matchField(cronMin, minute) && matchField(cronHour, hour) && matchField(cronDow, dow);
}

function matchField(field, value) {
  if (field === '*') return true;
  for (const part of field.split(',')) {
    if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number);
      if (value >= s && value <= e) return true;
    } else {
      if (parseInt(part, 10) === value) return true;
    }
  }
  return false;
}

function describeCron(cronExpr) {
  const schedules = cronExpr.split(';').map(s => s.trim()).filter(Boolean);
  return schedules.map(s => {
    const parts = s.split(/\s+/);
    if (parts.length !== 5) return s;
    const [m, h, , , d] = parts;
    const times = h.split(',').map(hh => `${hh}:${m.padStart(2, '0')}`).join(' と ');
    const dayStr = d === '*' ? '毎日' : d === '1-5' ? '平日' : `曜日${d}`;
    return `${dayStr} ${times}`;
  }).join(' / ');
}

// === サーバー起動 ===
app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, '0.0.0.0', () => {
    console.log(`▲ Note Auto Poster`);
    console.log(`  http://localhost:${port}`);

    // スケジューラー開始
    const settings = loadSettings();
    const schedule = settings.posting?.cronSchedule || '0 9 * * *';
    console.log(`[scheduler] 自動投稿スケジュール開始: ${schedule} (${describeCron(schedule)})`);

    // 60秒ごとにスケジュールチェック
    setInterval(checkSchedule, 60 * 1000);
    console.log('[scheduler] チェッカー起動 (60秒間隔)');
  });
});
