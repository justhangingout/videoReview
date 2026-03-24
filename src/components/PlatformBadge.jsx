const STATUS_STYLES = {
  live:    'bg-green-100 text-green-800 border-green-200',
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  error:   'bg-red-100 text-red-800 border-red-200',
  draft:   'bg-gray-100 text-gray-600 border-gray-200',
};

const PLATFORM_ICONS = {
  ebay:       '🛒',
  craigslist: '📌',
  facebook:   '👥',
};

export default function PlatformBadge({ platform, status, url }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.draft;
  const icon = PLATFORM_ICONS[platform] || '🔗';

  const inner = (
    <span className={`inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2 py-0.5 ${style}`}>
      {icon} {platform} · {status}
    </span>
  );

  if (url && status === 'live') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
        {inner}
      </a>
    );
  }
  return inner;
}
