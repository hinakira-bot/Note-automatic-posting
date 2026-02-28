'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'ダッシュボード', icon: '📊' },
  { href: '/keywords', label: 'キーワード', icon: '🔑' },
  { href: '/knowledge', label: 'ナレッジ', icon: '📚' },
  { href: '/prompts', label: 'プロンプト', icon: '📝' },
  { href: '/settings', label: '設定', icon: '⚙️' },
  { href: '/logs', label: 'ログ', icon: '📋' },
];

export default function Sidebar({ onRunPipeline }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      {/* ロゴ */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">Note 自動投稿</h1>
        <p className="text-xs text-gray-400 mt-1">Auto Poster v1.0</p>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* パイプライン実行ボタン */}
      <div className="p-4 border-t border-gray-700 space-y-2">
        <button
          onClick={() => onRunPipeline?.({ dryRun: false })}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          ▶ 投稿実行
        </button>
        <button
          onClick={() => onRunPipeline?.({ dryRun: true })}
          className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer"
        >
          🧪 ドライラン
        </button>
      </div>
    </aside>
  );
}
