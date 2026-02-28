'use client';

import { useState, useEffect, useRef } from 'react';
import Modal from '@/components/Modal';

export default function KnowledgePage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewContent, setPreviewContent] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/knowledge');
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error('ナレッジ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/knowledge', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        fetchFiles();
      } else {
        const data = await res.json();
        alert(data.error || 'アップロードに失敗しました');
      }
    } catch (err) {
      alert('アップロードエラー: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(`「${filename}」を削除しますか？`)) return;

    const res = await fetch(`/api/knowledge/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      fetchFiles();
    }
  };

  const handlePreview = async (filename) => {
    setPreviewFile(filename);
    setPreviewContent('読み込み中...');
    try {
      const res = await fetch(`/api/knowledge/${encodeURIComponent(filename)}`);
      const data = await res.json();
      setPreviewContent(data.content || '(内容なし)');
    } catch {
      setPreviewContent('読み込みに失敗しました');
    }
  };

  // ドラッグ&ドロップ
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/knowledge', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        fetchFiles();
      } else {
        const data = await res.json();
        alert(data.error || 'アップロードに失敗しました');
      }
    } catch (err) {
      alert('アップロードエラー: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">ナレッジ管理</h1>

      {/* アップロードエリア */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center mb-6 transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <p className="text-gray-500 mb-3">
          ファイルをドラッグ＆ドロップ、またはボタンでアップロード
        </p>
        <p className="text-xs text-gray-400 mb-4">対応形式: .txt, .pdf</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.pdf"
          onChange={handleUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
        >
          {uploading ? 'アップロード中...' : 'ファイルを選択'}
        </button>
      </div>

      {/* ファイル一覧 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">読み込み中...</div>
        ) : files.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>ナレッジファイルがありません</p>
            <p className="text-sm mt-2">文体指示やスタイルガイドなどのファイルをアップロードしてください</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">ファイル名</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">形式</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">サイズ</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">追加日</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {files.map((f) => (
                <tr key={f.filename} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    📄 {f.filename}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 uppercase">{f.format}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{f.sizeKB}KB</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(f.addedAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handlePreview(f.filename)}
                      className="text-blue-600 hover:text-blue-800 text-sm mr-3 cursor-pointer"
                    >
                      表示
                    </button>
                    <button
                      onClick={() => handleDelete(f.filename)}
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

      {/* プレビューモーダル */}
      <Modal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        title={previewFile || ''}
        maxWidth="max-w-2xl"
      >
        <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
          {previewContent}
        </pre>
      </Modal>
    </div>
  );
}
