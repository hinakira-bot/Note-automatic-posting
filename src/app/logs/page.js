'use client';

import { useState, useEffect } from 'react';
import StatusBadge from '@/components/StatusBadge';

export default function LogsPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (err) {
      console.error('ログ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">投稿ログ</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">読み込み中...</div>
        ) : posts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            まだ投稿ログがありません
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">日時</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">タイトル</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">キーワード</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">結果</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">時間</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.map((post, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {post.timestamp
                      ? new Date(post.timestamp).toLocaleString('ja-JP', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-xs truncate">
                    {post.title || '(タイトルなし)'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {post.keyword || '-'}
                  </td>
                  <td className="px-6 py-4">
                    {post.error ? (
                      <StatusBadge status="failed" />
                    ) : post.dryRun ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        ドライラン
                      </span>
                    ) : (
                      <StatusBadge status="posted" />
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {post.elapsedSeconds ? `${post.elapsedSeconds}秒` : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {post.url ? (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        表示 →
                      </a>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
