import { usePolling } from '../hooks/usePolling';
import ListingCard, { ListingData } from '../components/ListingCard';
import AlertItem, { AlertData } from '../components/AlertItem';

interface DashboardStats {
  totalShops: number;
  activeKeywords: number;
  hotListings: number;
  unreadAlerts: number;
}

interface DashboardData {
  stats: DashboardStats;
  topTrending: ListingData[];
  recentAlerts: AlertData[];
  crawlStatus: {
    status: 'running' | 'paused' | 'idle';
    jobsInQueue: number;
    currentJob?: string;
  };
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? 'text-gray-100'}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { data, loading } = usePolling<DashboardData>('analytics:dashboard', 30_000);

  const stats = data?.stats ?? {
    totalShops: 0,
    activeKeywords: 0,
    hotListings: 0,
    unreadAlerts: 0,
  };
  const topTrending = data?.topTrending ?? [];
  const recentAlerts = data?.recentAlerts ?? [];
  const crawlStatus = data?.crawlStatus ?? { status: 'idle' as const, jobsInQueue: 0 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Shops" value={stats.totalShops} />
        <StatCard label="Active Keywords" value={stats.activeKeywords} />
        <StatCard label="HOT Listings" value={stats.hotListings} accent="text-red-400" />
        <StatCard label="Unread Alerts" value={stats.unreadAlerts} accent="text-indigo-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Trending */}
        <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-100 mb-4">Top Trending</h2>
          {topTrending.length === 0 ? (
            <p className="text-sm text-gray-500">No trending listings yet. Start crawling to discover trends.</p>
          ) : (
            <div className="space-y-2">
              {topTrending.slice(0, 5).map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>

        {/* Crawl Status + Recent Alerts */}
        <div className="space-y-6">
          {/* Crawl status */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-100 mb-3">Crawl Status</h2>
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  crawlStatus.status === 'running'
                    ? 'bg-green-500 animate-pulse'
                    : crawlStatus.status === 'paused'
                    ? 'bg-yellow-500'
                    : 'bg-gray-500'
                }`}
              />
              <span className="text-sm text-gray-300 capitalize">{crawlStatus.status}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {crawlStatus.jobsInQueue} jobs in queue
            </p>
            {crawlStatus.currentJob && (
              <p className="text-xs text-gray-400 mt-1">
                Current: {crawlStatus.currentJob}
              </p>
            )}
          </div>

          {/* Recent Alerts */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-100 mb-3">Recent Alerts</h2>
            {recentAlerts.length === 0 ? (
              <p className="text-sm text-gray-500">No alerts yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {recentAlerts.slice(0, 10).map((alert) => (
                  <AlertItem key={alert.id} alert={alert} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
