'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const FREQUENCY_OPTIONS = [
  { value: 'daily1', label: '毎日1回' },
  { value: 'daily2', label: '毎日2回' },
  { value: 'weekday', label: '平日のみ' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const IMAGE_MODELS = [
  { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (推奨・高速)' },
  { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image (高品質)' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // APIキー管理用
  const [credentials, setCredentials] = useState(null);
  const [credForm, setCredForm] = useState({
    geminiApiKey: '',
    noteEmail: '',
    notePassword: '',
  });
  const [credSaving, setCredSaving] = useState(false);
  const [credMessage, setCredMessage] = useState('');

  // スケジュールUI用
  const [frequency, setFrequency] = useState('daily1');
  const [hour1, setHour1] = useState(9);
  const [hour2, setHour2] = useState(15);

  // 対話型セッション用
  const [sessionState, setSessionState] = useState({
    active: false,
    status: 'idle',
    message: '',
    hasSession: false,
  });
  const [screenshot, setScreenshot] = useState(null);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [typeInput, setTypeInput] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const fileInputRef = useRef(null);
  const imgRef = useRef(null);
  const pollingRef = useRef(null);

  // 参照画像用
  const [refImages, setRefImages] = useState([]);
  const [refImageUploading, setRefImageUploading] = useState(false);
  const [refImageMsg, setRefImageMsg] = useState('');
  const refImageInputRef = useRef(null);

  useEffect(() => {
    fetchSettings();
    fetchCredentials();
    fetchSessionState();
    fetchRefImages();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // セッションがactiveの間、スクリーンショットをポーリング
  useEffect(() => {
    if (sessionState.active) {
      const poll = async () => {
        try {
          const [ssRes, stateRes] = await Promise.all([
            fetch('/api/session/screenshot'),
            fetch('/api/session'),
          ]);
          const ssData = await ssRes.json();
          const stData = await stateRes.json();
          if (ssData.image) setScreenshot(ssData.image);
          setSessionState(stData);
          // 成功 or エラーで停止
          if (stData.status === 'success' || stData.status === 'error' || !stData.active) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } catch {}
      };
      poll(); // 初回即時
      pollingRef.current = setInterval(poll, 1500);
      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
      };
    }
  }, [sessionState.active]);

  const fetchSessionState = async () => {
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      setSessionState(data);
    } catch {}
  };

  const handleSessionStart = async () => {
    setSessionStarting(true);
    setScreenshot(null);
    try {
      const res = await fetch('/api/session', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setSessionState({ active: true, status: 'ready', message: data.message || '', hasSession: data.hasSession });
      } else {
        setSessionState(prev => ({ ...prev, status: 'error', message: data.error || 'エラー' }));
      }
    } catch (err) {
      setSessionState(prev => ({ ...prev, status: 'error', message: err.message }));
    } finally {
      setSessionStarting(false);
    }
  };

  const handleSessionClose = async () => {
    try {
      await fetch('/api/session', { method: 'DELETE' });
    } catch {}
    setSessionState({ active: false, status: 'idle', message: '', hasSession: sessionState.hasSession });
    setScreenshot(null);
  };

  const handleSessionUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMsg('');
    try {
      const text = await file.text();
      const res = await fetch('/api/session/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionData: text }),
      });
      const data = await res.json();
      if (data.ok) {
        setUploadMsg(data.message);
        setSessionState(prev => ({ ...prev, hasSession: true }));
      } else {
        setUploadMsg(data.error || 'アップロード失敗');
      }
    } catch (err) {
      setUploadMsg('エラー: ' + err.message);
    }
    // input をリセット
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTypeSubmit = async (e) => {
    e.preventDefault();
    if (!typeInput || !sessionState.active) return;
    try {
      await fetch('/api/session/type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: typeInput }),
      });
      setTypeInput('');
      // 入力後にスクリーンショット更新
      setTimeout(async () => {
        try {
          const res = await fetch('/api/session/screenshot');
          const data = await res.json();
          if (data.image) setScreenshot(data.image);
        } catch {}
      }, 500);
    } catch {}
  };

  const handleKeyPress = async (key) => {
    if (!sessionState.active) return;
    try {
      await fetch('/api/session/type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      setTimeout(async () => {
        try {
          const [ssRes, stRes] = await Promise.all([
            fetch('/api/session/screenshot'),
            fetch('/api/session'),
          ]);
          const ssData = await ssRes.json();
          const stData = await stRes.json();
          if (ssData.image) setScreenshot(ssData.image);
          setSessionState(stData);
        } catch {}
      }, 500);
    } catch {}
  };

  const handleScreenshotClick = useCallback(async (e) => {
    if (!imgRef.current || !sessionState.active) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    try {
      await fetch('/api/session/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
      // クリック後すぐにスクリーンショット更新
      setTimeout(async () => {
        try {
          const [ssRes, stRes] = await Promise.all([
            fetch('/api/session/screenshot'),
            fetch('/api/session'),
          ]);
          const ssData = await ssRes.json();
          const stData = await stRes.json();
          if (ssData.image) setScreenshot(ssData.image);
          setSessionState(stData);
        } catch {}
      }, 500);
    } catch {}
  }, [sessionState.active]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data.settings);

      // cron → シンプル選択に変換
      const cron = data.settings?.posting?.cronSchedule || '0 9 * * *';
      const parsed = parseCronSimple(cron);
      setFrequency(parsed.frequency);
      setHour1(parsed.hour1);
      setHour2(parsed.hour2);
    } catch (err) {
      console.error('設定取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCredentials = async () => {
    try {
      const res = await fetch('/api/credentials');
      const data = await res.json();
      setCredentials(data);
    } catch (err) {
      console.error('クレデンシャル取得エラー:', err);
    }
  };

  const fetchRefImages = async () => {
    try {
      const res = await fetch('/api/reference-images');
      const data = await res.json();
      setRefImages(data.images || []);
    } catch (err) {
      console.error('参照画像取得エラー:', err);
    }
  };

  const handleRefImageUpload = async (e, imageType) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefImageUploading(true);
    setRefImageMsg('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', imageType);

      const res = await fetch('/api/reference-images', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.ok) {
        setRefImageMsg(data.message);
        fetchRefImages();
        setTimeout(() => setRefImageMsg(''), 3000);
      } else {
        setRefImageMsg(data.error || 'アップロード失敗');
      }
    } catch (err) {
      setRefImageMsg('エラー: ' + err.message);
    } finally {
      setRefImageUploading(false);
      if (refImageInputRef.current) refImageInputRef.current.value = '';
    }
  };

  const handleRefImageDelete = async (filename) => {
    try {
      const res = await fetch('/api/reference-images', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchRefImages();
      }
    } catch (err) {
      console.error('参照画像削除エラー:', err);
    }
  };

  const handleCredSave = async () => {
    setCredSaving(true);
    setCredMessage('');

    const payload = {};
    for (const [key, val] of Object.entries(credForm)) {
      if (val.trim()) payload[key] = val.trim();
    }

    if (Object.keys(payload).length === 0) {
      setCredMessage('変更する項目を入力してください');
      setCredSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setCredMessage('APIキーを更新しました');
        setCredForm({ geminiApiKey: '', noteEmail: '', notePassword: '' });
        fetchCredentials();
        setTimeout(() => setCredMessage(''), 3000);
      } else {
        const data = await res.json();
        setCredMessage(data.error || '保存に失敗しました');
      }
    } catch (err) {
      setCredMessage('エラー: ' + err.message);
    } finally {
      setCredSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    const cron = buildCronSimple({ frequency, hour1, hour2 });
    const updates = {
      'article.minLength': settings.article.minLength,
      'article.maxLength': settings.article.maxLength,
      'article.defaultCategory': settings.article.defaultCategory,
      'knowledge.maxFileSizeKB': settings.knowledge.maxFileSizeKB,
      'knowledge.maxTotalChars': settings.knowledge.maxTotalChars,
      'posting.cronSchedule': cron,
      'posting.dryRun': settings.posting.dryRun,
    };

    if (settings.imageModel) {
      updates['imageModel'] = settings.imageModel;
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      if (res.ok) {
        setMessage('設定を保存しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await res.json();
        setMessage(data.error || '保存に失敗しました');
      }
    } catch (err) {
      setMessage('エラー: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (path, value) => {
    setSettings((prev) => {
      const result = { ...prev };
      const keys = path.split('.');
      let current = result;
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return result;
    });
  };

  if (loading || !settings) {
    return <div className="text-center text-gray-500 py-12">読み込み中...</div>;
  }

  const cronDescription = describeCronSimple({ frequency, hour1, hour2 });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">設定</h1>

      <div className="space-y-8">
        {/* ログインセッション */}
        <Section title="ログインセッション">
          <div className="text-sm text-gray-600 mb-3">
            note.com へのログインセッションを管理します。セッションが有効な間は自動投稿時にログイン不要です。
          </div>

          {/* セッション状態 */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm font-medium text-gray-700">状態:</span>
            {sessionState.hasSession ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                セッション保存済み
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                未取得
              </span>
            )}
          </div>

          {/* 成功メッセージ */}
          {sessionState.status === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800 mb-3">
              {sessionState.message}
            </div>
          )}

          {/* アップロード成功/エラー */}
          {uploadMsg && (
            <div className={`rounded-lg px-4 py-3 text-sm mb-3 ${uploadMsg.includes('エラー') || uploadMsg.includes('失敗') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
              {uploadMsg}
            </div>
          )}

          {/* エラーメッセージ */}
          {sessionState.status === 'error' && !sessionState.active && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-3">
              {sessionState.message}
            </div>
          )}

          {/* 方法1: セッションファイルをアップロード */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">方法1: ローカルPCからセッションをアップロード（推奨）</h3>
            <ol className="text-xs text-gray-600 space-y-1 mb-3 list-decimal list-inside">
              <li>ローカルPCでツールを起動: <code className="bg-gray-200 px-1 rounded">npm run test:login</code></li>
              <li>ブラウザが開くので note.com にログイン</li>
              <li>生成された <code className="bg-gray-200 px-1 rounded">data/session/state.json</code> を下からアップロード</li>
            </ol>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleSessionUpload}
                className="text-xs"
              />
            </div>
          </div>

          {/* 方法2: サーバー上で対話型ログイン */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">方法2: サーバー上で対話型ログイン</h3>
            <p className="text-xs text-gray-600 mb-3">
              サーバーのブラウザでログインを試みます。reCAPTCHAの画像認証が無限に続く場合は方法1をお使いください。
            </p>

            {/* 開始/終了ボタン */}
            {!sessionState.active ? (
              <button
                onClick={handleSessionStart}
                disabled={sessionStarting}
                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                {sessionStarting ? '起動中...' : '対話型ログイン開始'}
              </button>
            ) : (
            <>
              {/* ステータスメッセージ */}
              {sessionState.message && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 mb-3">
                  {sessionState.message}
                </div>
              )}

              {/* スクリーンショット（クリック可能） */}
              {screenshot && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">
                    画面をクリックして操作できます（reCAPTCHAのチェック、ログインボタンのクリック等）
                  </p>
                  <div
                    className="border-2 border-blue-300 rounded-lg overflow-hidden cursor-crosshair relative"
                    style={{ maxWidth: '100%' }}
                  >
                    <img
                      ref={imgRef}
                      src={`data:image/jpeg;base64,${screenshot}`}
                      alt="ブラウザ画面"
                      onClick={handleScreenshotClick}
                      className="w-full h-auto block"
                      draggable={false}
                    />
                  </div>
                </div>
              )}

              {/* キーボード入力 */}
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">キーボード入力（パスワード欄をクリックしてから入力）</p>
                <form onSubmit={handleTypeSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={typeInput}
                    onChange={(e) => setTypeInput(e.target.value)}
                    className="input-field flex-1"
                    placeholder="テキストを入力して送信..."
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    送信
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeyPress('Tab')}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    Tab
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeyPress('Enter')}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    Enter
                  </button>
                </form>
              </div>

              {/* ローディング（スクリーンショット未取得時） */}
              {!screenshot && sessionState.status === 'starting' && (
                <div className="border-2 border-gray-200 rounded-lg p-12 text-center text-gray-400 mb-3">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                  ブラウザを起動中...
                </div>
              )}

              {/* reCAPTCHA注意 */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 mb-3">
                <strong>reCAPTCHAの画像認証が延々と続く場合:</strong> VPSのIPがGoogleにデータセンターIPと判定されています。
                その場合は「セッションを閉じる」→ しばらく時間をおいてから再試行してください。
                何度試しても解決しない場合は、時間帯を変えて試すと通ることがあります。
              </div>

              <button
                onClick={handleSessionClose}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                セッションを閉じる
              </button>
            </>
            )}
          </div>
        </Section>

        {/* APIキー・認証情報 */}
        <Section title="APIキー・認証情報">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 mb-2">
            APIキー・パスワードはサーバー上の .env ファイルに保存されます。変更する項目のみ入力してください（空欄の項目は現在の値が維持されます）。
          </div>

          {credentials && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">現在の設定状況</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-gray-500">Gemini APIキー:</span>
                <span className="font-mono text-gray-800">{credentials.geminiApiKey || '未設定'}</span>
                <span className="text-gray-500">Note メールアドレス:</span>
                <span className="font-mono text-gray-800">{credentials.noteEmail || '未設定'}</span>
                <span className="text-gray-500">Note パスワード:</span>
                <span className="font-mono text-gray-800">{credentials.notePassword || '未設定'}</span>
              </div>
            </div>
          )}

          <Field label="Gemini APIキー">
            <input
              type="password"
              value={credForm.geminiApiKey}
              onChange={(e) => setCredForm({ ...credForm, geminiApiKey: e.target.value })}
              className="input-field"
              placeholder="変更する場合のみ入力"
              autoComplete="off"
            />
          </Field>
          <Field label="Note メールアドレス">
            <input
              type="email"
              value={credForm.noteEmail}
              onChange={(e) => setCredForm({ ...credForm, noteEmail: e.target.value })}
              className="input-field"
              placeholder="変更する場合のみ入力"
              autoComplete="off"
            />
          </Field>
          <Field label="Note パスワード">
            <input
              type="password"
              value={credForm.notePassword}
              onChange={(e) => setCredForm({ ...credForm, notePassword: e.target.value })}
              className="input-field"
              placeholder="変更する場合のみ入力"
              autoComplete="off"
            />
          </Field>

          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={handleCredSave}
              disabled={credSaving}
              className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {credSaving ? '保存中...' : 'APIキーを更新'}
            </button>
            {credMessage && (
              <span className="text-sm text-amber-700">{credMessage}</span>
            )}
          </div>
        </Section>

        {/* 記事設定 */}
        <Section title="記事設定">
          <Field label="最小文字数">
            <input
              type="number"
              value={settings.article.minLength}
              onChange={(e) => updateField('article.minLength', parseInt(e.target.value) || 0)}
              className="input-field"
            />
          </Field>
          <Field label="最大文字数">
            <input
              type="number"
              value={settings.article.maxLength}
              onChange={(e) => updateField('article.maxLength', parseInt(e.target.value) || 0)}
              className="input-field"
            />
          </Field>
          <Field label="デフォルトハッシュタグ">
            <input
              type="text"
              value={settings.article.defaultCategory}
              onChange={(e) => updateField('article.defaultCategory', e.target.value)}
              className="input-field"
              placeholder="未設定"
            />
          </Field>
        </Section>

        {/* ナレッジ設定 */}
        <Section title="ナレッジ設定">
          <Field label="ファイルサイズ上限 (KB)">
            <input
              type="number"
              value={settings.knowledge.maxFileSizeKB}
              onChange={(e) => updateField('knowledge.maxFileSizeKB', parseInt(e.target.value) || 100)}
              className="input-field"
            />
          </Field>
          <Field label="全体文字数上限">
            <input
              type="number"
              value={settings.knowledge.maxTotalChars}
              onChange={(e) => updateField('knowledge.maxTotalChars', parseInt(e.target.value) || 50000)}
              className="input-field"
            />
          </Field>
        </Section>

        {/* 自動投稿スケジュール */}
        <Section title="自動投稿スケジュール">
          <Field label="投稿頻度">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="input-field"
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>

          <Field label="1回目の時刻">
            <select
              value={hour1}
              onChange={(e) => setHour1(parseInt(e.target.value))}
              className="input-field"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{h}:00</option>
              ))}
            </select>
          </Field>

          {frequency === 'daily2' && (
            <Field label="2回目の時刻">
              <select
                value={hour2}
                onChange={(e) => setHour2(parseInt(e.target.value))}
                className="input-field"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
            </Field>
          )}

          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
            {cronDescription}
          </div>
        </Section>

        {/* 画像生成モデル */}
        <Section title="画像生成">
          <Field label="画像生成モデル">
            <select
              value={settings.imageModel || 'gemini-3.1-flash-image-preview'}
              onChange={(e) => updateField('imageModel', e.target.value)}
              className="input-field"
            >
              {IMAGE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </Field>

          {/* 参照画像アップロード */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">参照画像（スタイル参考）</h3>
            <p className="text-xs text-gray-600 mb-3">
              アイキャッチや図解のスタイル参考として画像をアップロードできます。
              アップロードした画像の雰囲気・色使い・テイストを参考にAIが画像を生成します。
            </p>

            {refImageMsg && (
              <div className={`rounded-lg px-4 py-2 text-sm mb-3 ${refImageMsg.includes('エラー') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                {refImageMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* アイキャッチ参照 */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-700 mb-2">アイキャッチ用参照</p>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => handleRefImageUpload(e, 'eyecatch')}
                  disabled={refImageUploading}
                  className="text-xs w-full"
                />
                {/* アイキャッチ参照画像一覧 */}
                {refImages.filter(img => img.type === 'eyecatch').map((img) => (
                  <div key={img.filename} className="mt-2 flex items-center gap-2">
                    <img
                      src={`data:${img.mimeType};base64,${img.base64}`}
                      alt={img.filename}
                      className="w-16 h-10 object-cover rounded border"
                    />
                    <span className="text-xs text-gray-500 flex-1 truncate">{img.filename}</span>
                    <button
                      onClick={() => handleRefImageDelete(img.filename)}
                      className="text-red-500 hover:text-red-700 text-xs cursor-pointer"
                    >
                      削除
                    </button>
                  </div>
                ))}
                {refImages.filter(img => img.type === 'eyecatch').length === 0 && (
                  <p className="text-xs text-gray-400 mt-2">未設定（デフォルトスタイルで生成）</p>
                )}
              </div>

              {/* 図解参照 */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-700 mb-2">図解用参照</p>
                <input
                  ref={refImageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => handleRefImageUpload(e, 'diagram')}
                  disabled={refImageUploading}
                  className="text-xs w-full"
                />
                {/* 図解参照画像一覧 */}
                {refImages.filter(img => img.type === 'diagram').map((img) => (
                  <div key={img.filename} className="mt-2 flex items-center gap-2">
                    <img
                      src={`data:${img.mimeType};base64,${img.base64}`}
                      alt={img.filename}
                      className="w-16 h-10 object-cover rounded border"
                    />
                    <span className="text-xs text-gray-500 flex-1 truncate">{img.filename}</span>
                    <button
                      onClick={() => handleRefImageDelete(img.filename)}
                      className="text-red-500 hover:text-red-700 text-xs cursor-pointer"
                    >
                      削除
                    </button>
                  </div>
                ))}
                {refImages.filter(img => img.type === 'diagram').length === 0 && (
                  <p className="text-xs text-gray-400 mt-2">未設定（デフォルトスタイルで生成）</p>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-500">
              ※ 各タイプ最大3枚まで。PNG/JPG/WEBP/GIF対応（5MB以下）
            </p>
          </div>
        </Section>

        {/* その他 */}
        <Section title="その他">
          <Field label="ドライラン（投稿スキップ）">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.posting.dryRun}
                onChange={(e) => updateField('posting.dryRun', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-600">有効にすると実際の投稿をスキップします</span>
            </label>
          </Field>
        </Section>

        {/* 保存ボタン */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? '保存中...' : '設定を保存'}
          </button>
          {message && (
            <span className="text-sm">{message}</span>
          )}
        </div>
      </div>

      <style jsx>{`
        :global(.input-field) {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        :global(.input-field:focus) {
          outline: none;
          box-shadow: 0 0 0 2px #3b82f6;
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

// --- ヘルパー関数（クライアントサイド） ---

function buildCronSimple({ frequency, hour1, hour2 }) {
  const h1 = Math.min(23, Math.max(0, parseInt(hour1) || 0));
  switch (frequency) {
    case 'daily2': {
      const h2 = Math.min(23, Math.max(0, parseInt(hour2) || 15));
      const hours = [h1, h2].sort((a, b) => a - b).join(',');
      return `0 ${hours} * * *`;
    }
    case 'weekday':
      return `0 ${h1} * * 1-5`;
    default:
      return `0 ${h1} * * *`;
  }
}

function parseCronSimple(cron) {
  if (!cron) return { frequency: 'daily1', hour1: 9, hour2: 15 };
  const parts = cron.split(' ');
  if (parts.length !== 5) return { frequency: 'daily1', hour1: 9, hour2: 15 };
  const [, hourStr, , , dow] = parts;
  const hours = hourStr.split(',').map(Number);
  return {
    frequency: dow === '1-5' ? 'weekday' : hours.length > 1 ? 'daily2' : 'daily1',
    hour1: hours[0] || 9,
    hour2: hours[1] || 15,
  };
}

function describeCronSimple({ frequency, hour1, hour2 }) {
  const h1 = parseInt(hour1) || 0;
  const h2 = parseInt(hour2) || 15;
  switch (frequency) {
    case 'daily2':
      return `毎日 ${h1}:00 と ${h2}:00 に自動投稿`;
    case 'weekday':
      return `平日 ${h1}:00 に自動投稿`;
    default:
      return `毎日 ${h1}:00 に自動投稿`;
  }
}
