/**
 * Next.js Instrumentation Hook
 * サーバー起動時にスケジューラーを自動開始する。
 *
 * node-cron は Next.js 16 production (cluster mode) で発火しない問題があるため、
 * setInterval で毎分チェックする方式に変更。
 * settings.json から動的にスケジュールを読み込むため、Web UIで変更即反映。
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { loadSettings } = await import('./settings-manager.js');
      const { startPipeline, getStatus } = await import('./lib/pipeline-runner.js');

      // 最後に実行した時刻を記録（同じ分に2回実行しない）
      let lastRunKey = '';

      // 60秒ごとにスケジュールをチェック
      const CHECK_INTERVAL = 60 * 1000;

      const checkSchedule = async () => {
        try {
          const settings = loadSettings();
          const cronExpr = settings.posting?.cronSchedule || '0 9 * * *';

          const now = new Date();
          const currentMinute = now.getMinutes();
          const currentHour = now.getHours();
          const currentDow = now.getDay(); // 0=日, 1=月, ..., 6=土
          const runKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${currentHour}-${currentMinute}`;

          // 同じ分に2回実行しない
          if (runKey === lastRunKey) return;

          // cron式をパース: "分 時 日 月 曜日" （";"区切りで複数スケジュール対応）
          const schedules = cronExpr.split(';').map(s => s.trim()).filter(Boolean);
          const matched = schedules.some(s => shouldRun(s, currentMinute, currentHour, currentDow));
          if (!matched) return;

          // 実行中チェック
          const status = getStatus();
          if (status.running) {
            console.log('[scheduler] パイプライン実行中のためスキップ');
            return;
          }

          lastRunKey = runKey;
          console.log(`[scheduler] --- スケジュール実行開始 (${currentHour}:${String(currentMinute).padStart(2, '0')}) ---`);

          const dryRun = settings.posting?.dryRun ?? false;
          await startPipeline({ dryRun });

          console.log('[scheduler] --- スケジュール実行完了 ---');
        } catch (err) {
          console.error(`[scheduler] パイプラインエラー: ${err.message}`);
        }
      };

      setInterval(checkSchedule, CHECK_INTERVAL);

      // 初期ログ
      const settings = loadSettings();
      const schedule = settings.posting?.cronSchedule || '0 9 * * *';
      console.log(`[scheduler] 自動投稿スケジュール開始: ${schedule} (${describeCron(schedule)})`);
    } catch (err) {
      console.error(`[scheduler] 初期化エラー: ${err.message}`);
    }
  }
}

/**
 * cron式が現在の時刻にマッチするかチェック
 * 対応形式: "分 時 * * *", "分 時1,時2 * * *", "分 時 * * 1-5"
 */
function shouldRun(cronExpr, minute, hour, dow) {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [cronMin, cronHour, , , cronDow] = parts;

  // 分チェック
  if (!matchCronField(cronMin, minute)) return false;

  // 時チェック
  if (!matchCronField(cronHour, hour)) return false;

  // 曜日チェック
  if (!matchCronField(cronDow, dow)) return false;

  return true;
}

/**
 * cron フィールドの1項目をマッチ
 * "*", "9", "7,20", "1-5", "0,10,20,30,40,50" 等に対応
 */
function matchCronField(field, value) {
  if (field === '*') return true;

  // カンマ区切り: "7,20"
  const parts = field.split(',');
  for (const part of parts) {
    // レンジ: "1-5"
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (value >= start && value <= end) return true;
    } else {
      if (parseInt(part, 10) === value) return true;
    }
  }
  return false;
}

/**
 * cron式を日本語の説明に変換
 */
function describeCron(cronExpr) {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return cronExpr;

  const [cronMin, cronHour, , , cronDow] = parts;
  const min = cronMin === '0' ? ':00' : `:${cronMin.padStart(2, '0')}`;
  const hours = cronHour.split(',').map(h => `${h}${min}`).join(' と ');
  const dowStr = cronDow === '*' ? '毎日' : cronDow === '1-5' ? '平日' : `曜日${cronDow}`;

  return `${dowStr} ${hours}`;
}
