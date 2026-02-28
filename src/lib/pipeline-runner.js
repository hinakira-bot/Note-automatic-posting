/**
 * パイプライン実行管理シングルトン
 * Web UIからのパイプライン実行を管理し、SSEクライアントに進捗をブロードキャストする
 */

// グローバルシングルトン（Next.js HMRでも維持）
const globalKey = Symbol.for('pipeline-runner');
if (!global[globalKey]) {
  global[globalKey] = {
    running: false,
    step: 'idle',
    keyword: '',
    title: '',
    progress: 0,
    startedAt: null,
    logs: [],
    result: null,
    subscribers: new Set(),
  };
}

const state = global[globalKey];

function broadcast(eventData) {
  const snapshot = getStatus();
  for (const cb of state.subscribers) {
    try {
      cb(snapshot, eventData);
    } catch { /* ignore subscriber errors */ }
  }
}

function addLog(level, message) {
  const entry = {
    time: new Date().toLocaleTimeString('ja-JP'),
    level,
    message,
  };
  state.logs.push(entry);
  // ログが多すぎたら古いのを削除
  if (state.logs.length > 200) {
    state.logs = state.logs.slice(-100);
  }
  broadcast({ type: 'log', data: entry });
}

/** 進捗コールバック（pipeline.jsから呼ばれる） */
function onProgress({ step, message, progress, keyword, title }) {
  if (step) state.step = step;
  if (progress !== undefined) state.progress = progress;
  if (keyword) state.keyword = keyword;
  if (title) state.title = title;
  if (message) addLog('info', message);
  broadcast({ type: 'progress' });
}

/** パイプラインを開始 */
export async function startPipeline(options = {}) {
  if (state.running) {
    // 15分以上経過している場合は強制リセット（ハングアップ対策）
    const elapsed = state.startedAt
      ? (Date.now() - new Date(state.startedAt).getTime()) / 1000
      : 0;
    if (elapsed > 900) {
      state.running = false;
      addLog('warn', '前回のパイプラインがタイムアウトしました。強制リセットします。');
    } else {
      throw new Error('パイプラインは既に実行中です');
    }
  }

  // 状態リセット
  state.running = true;
  state.step = 'keyword';
  state.keyword = '';
  state.title = '';
  state.progress = 0;
  state.startedAt = new Date().toISOString();
  state.logs = [];
  state.result = null;

  const modeLabel = options.dryRun ? 'ドライラン' : '本番';
  const kwLabel = options.keywordId ? ' / キーワード指定' : '';
  addLog('info', `パイプライン開始 (${modeLabel}${kwLabel})`);
  broadcast({ type: 'started' });

  // 非同期で実行（呼び出し元はawaitしない）
  (async () => {
    try {
      // pipeline.js を動的インポート（循環参照回避）
      const { runPipeline } = await import('../pipeline.js');

      const result = await runPipeline({
        ...options,
        onProgress,
      });

      state.step = result.success ? 'done' : 'error';
      state.progress = result.success ? 100 : state.progress;
      state.result = result;

      addLog(
        result.success ? 'info' : 'error',
        result.success
          ? `完了: ${result.title} (${result.elapsed}秒)`
          : `エラー: ${result.error || '不明'}`
      );
      broadcast({ type: 'done' });
    } catch (err) {
      state.step = 'error';
      state.result = { success: false, error: err.message };
      addLog('error', `致命的エラー: ${err.message}`);
      broadcast({ type: 'done' });
    } finally {
      // 成功・失敗・例外いずれの場合も必ず running を解除
      state.running = false;
    }
  })();
}

/** 現在の状態を取得 */
export function getStatus() {
  return {
    running: state.running,
    step: state.step,
    keyword: state.keyword,
    title: state.title,
    progress: state.progress,
    startedAt: state.startedAt,
    logs: [...state.logs],
    result: state.result,
  };
}

/** パイプラインを強制リセット */
export function resetPipeline() {
  const wasRunning = state.running;
  state.running = false;
  state.step = 'idle';
  state.progress = 0;
  state.result = null;
  state.keyword = '';
  state.title = '';
  state.startedAt = null;
  state.logs = [];
  broadcast({ type: 'reset' });
  return { reset: true, wasRunning };
}

/** SSEリスナー登録 */
export function subscribe(callback) {
  state.subscribers.add(callback);
}

/** SSEリスナー解除 */
export function unsubscribe(callback) {
  state.subscribers.delete(callback);
}
