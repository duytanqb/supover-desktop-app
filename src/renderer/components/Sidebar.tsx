import { NavLink } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';

interface CrawlStatus {
  status: 'running' | 'paused' | 'idle';
  jobsInQueue: number;
}

interface UnreadCount {
  count: number;
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: '\u25A6' },
  { to: '/trending', label: 'Trending', icon: '\uD83D\uDD25' },
  { to: '/shops', label: 'Shops', icon: '\uD83C\uDFEA' },
  { to: '/keywords', label: 'Keywords', icon: '\uD83D\uDD0D' },
  { to: '/alerts', label: 'Alerts', icon: '\uD83D\uDD14' },
  { to: '/ai-insights', label: 'AI Insights', icon: '\u2728' },
  { to: '/settings', label: 'Settings', icon: '\u2699\uFE0F' },
];

export default function Sidebar() {
  const { data: crawlStatus } = usePolling<CrawlStatus>('crawl:status', 10_000);
  const { data: unreadData } = usePolling<UnreadCount>('alert:count-unread', 15_000);

  const unreadCount = unreadData?.count ?? 0;

  const statusColor = {
    running: 'bg-green-500',
    paused: 'bg-yellow-500',
    idle: 'bg-gray-500',
  };

  const statusLabel = {
    running: 'Crawling',
    paused: 'Paused',
    idle: 'Idle',
  };

  const currentStatus = crawlStatus?.status ?? 'idle';

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-50">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">\uD83D\uDD0D</span>
          <h1 className="text-lg font-bold text-gray-100 tracking-tight">Etsy Spy</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-indigo-400 border-l-2 border-indigo-400'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border-l-2 border-transparent'
              }`
            }
          >
            <span className="text-base w-5 text-center">{item.icon}</span>
            <span>{item.label}</span>
            {item.to === '/alerts' && unreadCount > 0 && (
              <span className="ml-auto bg-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Crawl Status */}
      <div className="px-4 py-4 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${statusColor[currentStatus]} animate-pulse`} />
          <span className="text-xs text-gray-400">{statusLabel[currentStatus]}</span>
          {crawlStatus?.jobsInQueue ? (
            <span className="ml-auto text-xs text-gray-500">
              {crawlStatus.jobsInQueue} in queue
            </span>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
