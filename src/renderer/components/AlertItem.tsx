import { formatRelativeTime } from '../utils/formatTime';

export interface AlertData {
  id: number;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  shop_name?: string;
  listing_title?: string;
  old_value?: string;
  new_value?: string;
  message?: string;
  is_read: boolean;
  created_at: string;
}

interface AlertItemProps {
  alert: AlertData;
  onClick?: () => void;
}

const severityDot: Record<string, string> = {
  info: 'bg-blue-400',
  warning: 'bg-yellow-400',
  critical: 'bg-red-400',
};

const typeLabels: Record<string, string> = {
  new_listing: 'New Listing',
  removed_listing: 'Removed Listing',
  price_change: 'Price Change',
  trend_change: 'Trend Change',
  rank_change: 'Rank Change',
  new_hot: 'New HOT',
  blocked: 'Blocked',
  crawl_error: 'Crawl Error',
};

export default function AlertItem({ alert, onClick }: AlertItemProps) {
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${
        alert.is_read ? 'bg-gray-900/50' : 'bg-gray-900 border border-gray-800'
      } hover:bg-gray-800/50`}
      onClick={onClick}
    >
      {/* Severity dot */}
      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${severityDot[alert.severity]}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-300 bg-gray-800 px-2 py-0.5 rounded">
            {typeLabels[alert.type] ?? alert.type}
          </span>
          {alert.shop_name && (
            <span className="text-xs text-gray-500">{alert.shop_name}</span>
          )}
        </div>

        {alert.message && (
          <p className="text-sm text-gray-300 mt-1 truncate">{alert.message}</p>
        )}

        {alert.old_value && alert.new_value && (
          <p className="text-xs text-gray-400 mt-1">
            <span className="text-red-400 line-through">{alert.old_value}</span>
            {' \u2192 '}
            <span className="text-green-400">{alert.new_value}</span>
          </p>
        )}
      </div>

      <span className="text-xs text-gray-500 flex-shrink-0 mt-0.5">
        {formatRelativeTime(alert.created_at)}
      </span>

      {!alert.is_read && (
        <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
      )}
    </div>
  );
}
