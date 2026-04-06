import { NavLink } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';

interface CrawlStatus {
  isRunning: boolean;
  isPaused: boolean;
  isBlackout: boolean;
  queueLength: number;
  currentTarget: string | null;
  nextCheckIn: number;
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/trending', label: 'Trending', icon: '🔥' },
  { to: '/shops', label: 'Shops', icon: '🏪' },
  { to: '/keywords', label: 'Keywords', icon: '🔍' },
  { to: '/ai-insights', label: 'AI Insights', icon: '✨' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const { data: crawlStatus } = usePolling<CrawlStatus>('crawl:status', 10_000);

  const currentStatus = crawlStatus?.currentTarget ? 'crawling' : crawlStatus?.isBlackout ? 'blackout' : crawlStatus?.isPaused ? 'paused' : crawlStatus?.isRunning ? 'running' : 'idle';

  const statusColor = { crawling: 'bg-green-500', running: 'bg-green-500', paused: 'bg-yellow-500', blackout: 'bg-orange-500', idle: 'bg-gray-500' };
  const statusLabel = { crawling: 'Crawling', running: 'Running', paused: 'Paused', blackout: 'Blackout 12-21h VN', idle: 'Idle' };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-50">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📈</span>
          <h1 className="text-lg font-bold text-gray-100 tracking-tight">Supover</h1>
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
          </NavLink>
        ))}
      </nav>

      {/* Crawl Status */}
      <div className="px-4 py-4 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${statusColor[currentStatus]} ${currentStatus === 'crawling' ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-gray-400">{statusLabel[currentStatus]}</span>
          {crawlStatus?.queueLength ? (
            <span className="ml-auto text-xs text-gray-500">
              {crawlStatus.queueLength} due
            </span>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
