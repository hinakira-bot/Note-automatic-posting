'use client';

import { useState, useEffect } from 'react';
import StatusBadge from '@/components/StatusBadge';

const PROMPT_LABELS = {
  'article-search-intent': { label: '検索意図分析', icon: '🔍', group: '記事生成' },
  'article-outline': { label: '見出し構成', icon: '📋', group: '記事生成' },
  'article-title': { label: 'タイトル生成', icon: '✏️', group: '記事生成' },
  'article-body': { label: '本文生成', icon: '📄', group: '記事生成' },
  'image-eyecatch': { label: 'アイキャッチ画像', icon: '🖼️', group: '画像生成' },
  'image-diagram': { label: '図解画像', icon: '📊', group: '画像生成' },
};

const TEMPLATE_VARS = {
  'article-search-intent': ['keyword', 'description', 'knowledge'],
  'article-outline': ['keyword', 'searchIntent', 'competitorHeadings', 'avgCharCount', 'description', 'knowledge'],
  'article-title': ['keyword', 'outlineText', 'description', 'knowledge'],
  'article-body': ['keyword', 'title', 'outlineFormatted', 'description', 'knowledge'],
  'image-eyecatch': ['keyword', 'title', 'description'],
  'image-diagram': ['keyword', 'title', 'sectionH2', 'sectionH3s', 'diagramDescription'],
};

export default function PromptsPage() {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const res = await fetch('/api/prompts');
      const data = await res.json();
      setPrompts(data.prompts || []);
    } catch (err) {
      console.error('プロンプト取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (name) => {
    setEditingPrompt(name);
    try {
      const res = await fetch(`/api/prompts/${name}`);
      const data = await res.json();
      setEditContent(data.content || '');
    } catch {
      setEditContent('読み込みに失敗しました');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/prompts/${editingPrompt}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        setEditingPrompt(null);
        fetchPrompts();
      } else {
        const data = await res.json();
        alert(data.error || '保存に失敗しました');
      }
    } catch (err) {
      alert('保存エラー: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (name) => {
    if (!confirm(`「${PROMPT_LABELS[name]?.label || name}」をデフォルトに戻しますか？`)) return;

    const res = await fetch(`/api/prompts/${name}`, { method: 'DELETE' });
    if (res.ok) {
      if (editingPrompt === name) {
        // 編集中のプロンプトをリセットした場合、再読み込み
        handleEdit(name);
      }
      fetchPrompts();
    }
  };

  // 編集画面
  if (editingPrompt) {
    const info = PROMPT_LABELS[editingPrompt] || { label: editingPrompt, icon: '📝' };
    const vars = TEMPLATE_VARS[editingPrompt] || [];

    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setEditingPrompt(null)}
            className="text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            ← 戻る
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {info.icon} {info.label}
          </h1>
        </div>

        {/* テンプレート変数ヘルプ */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm font-medium text-blue-800 mb-1">利用可能な変数:</p>
          <div className="flex flex-wrap gap-2">
            {vars.map((v) => (
              <code key={v} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                {'{{' + v + '}}'}
              </code>
            ))}
          </div>
          <p className="text-xs text-blue-600 mt-2">
            条件ブロック: {'{{#if 変数名}}'}...{'{{/if}}'} — 変数に値がある時のみ表示
          </p>
        </div>

        {/* エディタ */}
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full h-96 border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          placeholder="プロンプトテンプレートを入力..."
        />

        {/* ボタン */}
        <div className="flex justify-between mt-4">
          <button
            onClick={() => handleReset(editingPrompt)}
            className="text-sm text-gray-500 hover:text-red-600 cursor-pointer"
          >
            デフォルトに戻す
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => setEditingPrompt(null)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 一覧画面
  const groups = {};
  for (const p of prompts) {
    const info = PROMPT_LABELS[p.name] || { label: p.name, icon: '📝', group: 'その他' };
    const group = info.group || 'その他';
    if (!groups[group]) groups[group] = [];
    groups[group].push({ ...p, ...info });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">プロンプト編集</h1>

      {loading ? (
        <div className="text-center text-gray-500 py-12">読み込み中...</div>
      ) : (
        Object.entries(groups).map(([groupName, items]) => (
          <div key={groupName} className="mb-6">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
              {groupName}
            </h2>
            <div className="grid gap-3">
              {items.map((p) => (
                <div
                  key={p.name}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-4 flex items-center justify-between hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{p.icon}</span>
                    <div>
                      <p className="font-medium text-gray-900">{p.label}</p>
                      <p className="text-xs text-gray-500">{p.name}.md</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={p.status} />
                    <button
                      onClick={() => handleEdit(p.name)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium cursor-pointer"
                    >
                      編集
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
