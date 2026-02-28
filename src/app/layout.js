'use client';

import './globals.css';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import PipelineProgress from '@/components/PipelineProgress';

export default function RootLayout({ children }) {
  const [pipelineVisible, setPipelineVisible] = useState(false);
  const [configChecked, setConfigChecked] = useState(false);
  const [isConfigured, setIsConfigured] = useState(true);
  const pathname = usePathname();

  // 初回: 設定済みかチェック → 未設定なら /setup へリダイレクト
  useEffect(() => {
    // /setup ページでは未設定チェック不要
    if (pathname?.startsWith('/setup')) {
      setConfigChecked(true);
      return;
    }

    const checkConfig = async () => {
      try {
        const res = await fetch('/api/credentials');
        if (res.ok) {
          const data = await res.json();
          if (!data.isConfigured) {
            setIsConfigured(false);
            window.location.href = '/setup';
            return;
          }
        }
      } catch {
        // APIエラー時はそのまま通す
      }
      setConfigChecked(true);
    };

    checkConfig();
  }, [pathname]);

  const handleRunPipeline = async ({ dryRun }) => {
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      setPipelineVisible(true);
    } catch (err) {
      alert('パイプライン開始に失敗しました: ' + err.message);
    }
  };

  // セットアップページの場合はサイドバーなしレイアウト
  if (pathname?.startsWith('/setup')) {
    return (
      <html lang="ja">
        <head>
          <title>セットアップ - Note 自動投稿ツール</title>
        </head>
        <body className="bg-gray-100">
          {children}
        </body>
      </html>
    );
  }

  // 設定チェック中はローディング表示
  if (!configChecked) {
    return (
      <html lang="ja">
        <head>
          <title>Note 自動投稿ツール</title>
        </head>
        <body className="bg-gray-100">
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="ja">
      <head>
        <title>Note 自動投稿ツール</title>
      </head>
      <body className="bg-gray-100">
        <div className="flex min-h-screen">
          <Sidebar onRunPipeline={handleRunPipeline} />

          <main className="flex-1 flex flex-col">
            {/* パイプライン進捗（実行中は上部に表示） */}
            {pipelineVisible && (
              <div className="p-4 pb-0">
                <PipelineProgress onClose={() => setPipelineVisible(false)} />
              </div>
            )}

            {/* メインコンテンツ */}
            <div className="flex-1 p-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
