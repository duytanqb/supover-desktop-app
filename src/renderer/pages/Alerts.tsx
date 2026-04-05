import { useState, useEffect } from 'react';
import { useIPC } from '../hooks/useIPC';
import AlertItem, { AlertData } from '../components/AlertItem';

type GroupBy = 'time' | 'shop' | 'type';

interface AlertsResponse {
  alerts: AlertData[];
  total: number;
  page: number;
  pageSize: number;
}

interface UnreadCount {
  count: number;
}

export default function Alerts() {
  const [groupBy, setGroupBy] = useState<GroupBy>('time');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, loading, invoke: loadAlerts } = useIPC<AlertsResponse>('alert:list');
  const { data: unreadData, invoke: loadUnread } = useIPC<UnreadCount>('alert:count-unread');
  const { invoke: markRead } = useIPC('alert:mark-read');
  const { invoke: markAllRead } = useIPC('alert:mark-all-read');

  useEffect(() => {
    loadAlerts({ page, pageSize, groupBy });
    loadUnread();
  }, [page, groupBy]);

  const alerts = data?.alerts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const unreadCount = unreadData?.count ?? 0;

  const handleAlertClick = async (alert: AlertData) => {
    if (!alert.is_read) {
      await markRead({ id: alert.id });
      loadAlerts({ page, pageSize, groupBy });
      loadUnread();
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    loadAlerts({ page, pageSize, groupBy });
    loadUnread();
  };

  // Group alerts
  const groupedAlerts = (): Record<string, AlertData[]> => {
    if (groupBy === 'time') return { 'All Alerts': alerts };

    return alerts.reduce((acc, alert) => {
      const key = groupBy === 'shop' ? (alert.shop_name ?? 'Unknown') : alert.type;
      if (!acc[key]) acc[key] = [];
      acc[key].push(alert);
      return acc;
    }, {} as Record<string, AlertData[]>);
  };

  const groups = groupedAlerts();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-100">Alerts</h1>
          {unreadCount > 0 && (
            <span className="bg-indigo-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <button
          onClick={handleMarkAllRead}
          className="px-4 py-2 rounded-lg font-medium text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Mark All Read
        </button>
      </div>

      {/* Group toggle */}
      <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 w-fit border border-gray-800">
        {(['time', 'shop', 'type'] as GroupBy[]).map((g) => (
          <button
            key={g}
            onClick={() => {
              setGroupBy(g);
              setPage(1);
            }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              groupBy === g
                ? 'bg-gray-800 text-gray-100'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            By {g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {loading && alerts.length === 0 ? (
        <p className="text-sm text-gray-500">Loading alerts...</p>
      ) : Object.keys(groups).length === 0 || alerts.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-500">No alerts yet. Alerts will appear when changes are detected in your tracked shops and keywords.</p>
        </div>
      ) : (
        Object.entries(groups).map(([group, groupAlerts]) => (
          <div key={group}>
            {groupBy !== 'time' && (
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {group}
              </h2>
            )}
            <div className="space-y-2">
              {groupAlerts.map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onClick={() => handleAlertClick(alert)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {alerts.length} of {total} alerts
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
