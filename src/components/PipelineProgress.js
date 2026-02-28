'use client';

import { useState, useEffect, useRef } from 'react';

const STEP_LABELS = {
  idle: '待機中',
  keyword: 'キーワード取得',
  knowledge: 'ナレッジ読み込み',
  analysis: '競合分析',
  content: '記事生成',
  image: '画像生成',
  posting: 'Note投稿',
  done: '完了',
  error: 'エラー',
};

const STEP_ORDER = ['keyword', 'knowledge', 'analysis', 'content', 'image', 'posting', 'done'];

export default function PipelineProgress({ onClose }) {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    // SSE接続
    const es = new EventSource('/api/pipeline/stream');
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data);
        if (data.logs) {
          setLogs(data.logs);
        }
      } catch { /* ignore parse errors */ }
    };

    es.addEventListener('log', (event) => {
      try {
        const logEntry = JSON.parse(event.data);
        setLogs((prev) => [...prev, logEntry]);
      } catch { /* ignore */ }
    });

    es.addEventListener('done', () => {
      es.close();
    });

    es.onerror = () => {
      // 接続エラー時は再接続を試みない（完了したか、サーバーが停止）
      es.close();
    };

    return () => {
      es.close();
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const currentStep = status?.step || 'idle';
  const isRunning = status?.running;
  const progress = status?.progress || 0;

  const elapsed = status?.startedAt
    ? Math.round((Date.now() - new Date(status.startedAt).getTime()) / 1000)
    : 0;

  const formatElapsed = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}分${sec}秒` : `${sec}秒`;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* ヘッダー */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRunning ? (
            <span className="inline-block w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
          ) : currentStep === 'done' ? (
            <span className="text-green-500 text-lg">✓</span>
          ) : currentStep === 'error' ? (
            <span className="text-red-500 text-lg">✕</span>
          ) : null}
          <h3 className="font-semibold text-gray-900">
            {isRunning ? 'パイプライン実行中...' : currentStep === 'done' ? '投稿完了' : currentStep === 'error' ? 'エラー発生' : 'パイプライン'}
          </h3>
        </div>
        <div className="flex items-center gap-4">
          {elapsed > 0 && (
            <span className="text-sm text-gray-500">{formatElapsed(elapsed)}</span>
          )}
          {!isRunning && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ステップインジケーター */}
      <div className="px-6 py-4">
        <div className="flex items-center gap-1 mb-2">
          {STEP_ORDER.map((step) => {
            const stepIndex = STEP_ORDER.indexOf(step);
            const currentIndex = STEP_ORDER.indexOf(currentStep);
            const isDone = currentIndex > stepIndex || currentStep === 'done';
            const isCurrent = step === currentStep;

            return (
              <div key={step} className="flex-1">
                <div
                  className={`h-2 rounded-full transition-colors ${
                    isDone ? 'bg-green-500' : isCurrent ? 'bg-blue-500 animate-pulse' : 'bg-gray-200'
                  }`}
                />
              </div>
            );
          })}
        </div>
        <p className="text-sm text-gray-600">
          {STEP_LABELS[currentStep] || currentStep}
          {status?.keyword && ` — "${status.keyword}"`}
        </p>
        {status?.title && (
          <p className="text-sm text-gray-500 mt-1">タイトル: {status.title}</p>
        )}
      </div>

      {/* プログレスバー */}
      <div className="px-6">
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ログ */}
      <div className="px-6 py-4">
        <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-gray-500">ログを待機中...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={`py-0.5 ${
                log.level === 'error' ? 'text-red-400' :
                log.level === 'warn' ? 'text-yellow-400' :
                'text-green-400'
              }`}>
                <span className="text-gray-500">[{log.time || ''}]</span> {log.message}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>

      {/* 結果 */}
      {status?.result && (
        <div className={`px-6 py-4 border-t ${status.result.success ? 'bg-green-50' : 'bg-red-50'}`}>
          {status.result.success ? (
            <div>
              <p className="text-green-800 font-medium">
                ✅ 投稿完了: {status.result.title}
              </p>
              <p className="text-green-600 text-sm mt-1">
                所要時間: {formatElapsed(status.result.elapsed || 0)}
              </p>
            </div>
          ) : (
            <p className="text-red-800 font-medium">
              ❌ エラー: {status.result.error || '不明なエラー'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
