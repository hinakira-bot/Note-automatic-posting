'use client';

import { useState, useEffect } from 'react';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

  useEffect(() => {
    fetchKeywords();
  }, []);

  const fetchKeywords = async () => {
    try {
      const res = await fetch('/api/keywords');
      const data = await res.json();
      setKeywords(data.keywords || []);
    } catch (err) {
      console.error('キーワード取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (formData) => {
    const res = await fetch('/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (res.ok) {
      setShowAddModal(false);
      fetchKeywords();
    } else {
      const data = await res.json();
      alert(data.error || 'エラーが発生しました');
    }
  };

  const handleEdit = async (id, formData) => {
    const res = await fetch(`/api/keywords/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (res.ok) {
      setEditItem(null);
      fetchKeywords();
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('このキーワードを削除しますか？')) return;
    const res = await fetch(`/api/keywords/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchKeywords();
    }
  };

  const filtered = filter === 'all'
    ? keywords
    : keywords.filter((k) => k.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">キーワード管理</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          ＋ 追加
        </button>
      </div>

      {/* フィルター */}
      <div className="flex gap-2 mb-4">
        {['all', 'pending', 'posted', 'failed'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
              filter === s
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? '全て' : s === 'pending' ? '未投稿' : s === 'posted' ? '投稿済' : '失敗'}
            {s !== 'all' && (
              <span className="ml-1 opacity-75">
                ({keywords.filter((k) => k.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            キーワードがありません
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">キーワード</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">説明</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">ステータス</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">日時</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((kw) => (
                <tr key={kw.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {kw.keyword || <span className="text-gray-400">(なし)</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                    {kw.description || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={kw.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {kw.postedAt
                      ? new Date(kw.postedAt).toLocaleDateString('ja-JP')
                      : kw.createdAt
                      ? new Date(kw.createdAt).toLocaleDateString('ja-JP')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setEditItem(kw)}
                      className="text-blue-600 hover:text-blue-800 text-sm mr-3 cursor-pointer"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(kw.id)}
                      className="text-red-600 hover:text-red-800 text-sm cursor-pointer"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 追加モーダル */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="キーワード追加">
        <KeywordForm onSubmit={handleAdd} onCancel={() => setShowAddModal(false)} />
      </Modal>

      {/* 編集モーダル */}
      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="キーワード編集">
        {editItem && (
          <KeywordForm
            initial={editItem}
            onSubmit={(data) => handleEdit(editItem.id, data)}
            onCancel={() => setEditItem(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function KeywordForm({ initial = {}, onSubmit, onCancel }) {
  const [keyword, setKeyword] = useState(initial.keyword || '');
  const [description, setDescription] = useState(initial.description || '');
  const [category, setCategory] = useState(initial.category || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ keyword, description, category });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          キーワード
        </label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例: 副業 在宅ワーク 始め方"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          記事の説明（オプション）
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例: 初心者が月5万円稼ぐ方法を解説"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          カテゴリ（オプション）
        </label>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例: 副業"
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
        >
          キャンセル
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          {initial.id ? '更新' : '追加'}
        </button>
      </div>
    </form>
  );
}
