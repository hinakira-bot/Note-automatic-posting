const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-800',
  posted: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  default: 'bg-blue-100 text-blue-800',
  customized: 'bg-purple-100 text-purple-800',
  missing: 'bg-gray-100 text-gray-800',
};

const STATUS_LABELS = {
  pending: '未投稿',
  posted: '投稿済',
  failed: '失敗',
  default: 'デフォルト',
  customized: 'カスタム',
  missing: '未設定',
};

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const label = STATUS_LABELS[status] || status;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
