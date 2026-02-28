/**
 * Next.js Instrumentation Hook
 * サーバー起動時にcronスケジューラーを自動開始する。
 * PM2でNext.jsを1プロセス起動するだけで、Web UI + 定期投稿の両方が動く。
 */

export async function register() {
  // Node.jsランタイムでのみ実行（Edge Runtimeでは不要）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const cron = (await import('node-cron')).default;
      const config = (await import('./config.js')).default;
      const { startPipeline, getStatus } = await import('./lib/pipeline-runner.js');

      const schedule = config.posting.cronSchedule;

      if (!cron.validate(schedule)) {
        console.warn(`[cron] 無効なスケジュール: ${schedule}`);
        return;
      }

      cron.schedule(schedule, async () => {
        const status = getStatus();

        // 既に実行中ならスキップ
        if (status.running) {
          console.log('[cron] パイプライン実行中のためスキップ');
          return;
        }

        console.log('[cron] --- スケジュール実行開始 ---');
        try {
          await startPipeline({ dryRun: config.dryRun });
        } catch (err) {
          console.error(`[cron] パイプラインエラー: ${err.message}`);
        }
      });

      console.log(`[cron] 自動投稿スケジュール開始: ${schedule}`);
    } catch (err) {
      console.error(`[cron] スケジューラー初期化エラー: ${err.message}`);
    }
  }
}
