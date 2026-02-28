/**
 * スケジュールUIヘルパー
 * シンプル選択 ↔ cron式の変換
 */

/**
 * シンプル選択 → cron式に変換
 * @param {Object} params
 * @param {string} params.frequency - 'daily1' | 'daily2' | 'weekday'
 * @param {number} params.hour1 - 1回目の時間 (0-23)
 * @param {number} [params.hour2] - 2回目の時間 (0-23, daily2のみ)
 * @returns {string} cron式
 */
export function buildCron({ frequency, hour1, hour2 }) {
  const h1 = Math.min(23, Math.max(0, parseInt(hour1, 10) || 0));

  switch (frequency) {
    case 'daily2': {
      const h2 = Math.min(23, Math.max(0, parseInt(hour2, 10) || 15));
      const hours = [h1, h2].sort((a, b) => a - b).join(',');
      return `0 ${hours} * * *`;
    }
    case 'weekday':
      return `0 ${h1} * * 1-5`;
    case 'daily1':
    default:
      return `0 ${h1} * * *`;
  }
}

/**
 * cron式 → 日本語の説明文に変換
 * @param {string} cron - cron式 (例: '0 9 * * *')
 * @returns {string} 日本語説明
 */
export function describeCron(cron) {
  if (!cron) return '未設定';

  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [, hourStr, , , dayOfWeek] = parts;

  // 時間解析
  const hours = hourStr.split(',').map(Number);
  const timeStr = hours.map((h) => `${h}:00`).join(' と ');

  // 曜日解析
  if (dayOfWeek === '1-5') {
    return `平日 ${timeStr} に自動投稿`;
  }

  if (hours.length > 1) {
    return `毎日 ${timeStr} に自動投稿`;
  }

  return `毎日 ${timeStr} に自動投稿`;
}

/**
 * cron式 → シンプル選択パラメータに逆変換
 * @param {string} cron
 * @returns {Object} { frequency, hour1, hour2 }
 */
export function parseCron(cron) {
  if (!cron) return { frequency: 'daily1', hour1: 9, hour2: 15 };

  const parts = cron.split(' ');
  if (parts.length !== 5) return { frequency: 'daily1', hour1: 9, hour2: 15 };

  const [, hourStr, , , dayOfWeek] = parts;
  const hours = hourStr.split(',').map(Number);

  const frequency = dayOfWeek === '1-5' ? 'weekday' : hours.length > 1 ? 'daily2' : 'daily1';
  const hour1 = hours[0] || 9;
  const hour2 = hours[1] || 15;

  return { frequency, hour1, hour2 };
}
