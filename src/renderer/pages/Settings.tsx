import { useState, useEffect } from 'react';
import { useIPC } from '../hooks/useIPC';
import ProxyStatus from '../components/ProxyStatus';

interface SettingsData {
  vking_api_key?: string;
  ai_provider?: 'anthropic' | 'openai' | 'deepseek';
  ai_api_key?: string;
  ai_model?: string;
  crawl_interval?: string;
  delay_min?: number;
  delay_max?: number;
  theme?: 'dark' | 'light';
}

interface ProxyData {
  id: number;
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
  status: 'active' | 'failed' | 'retired';
  fail_count: number;
}

interface ProfileData {
  id: string;
  status: 'active' | 'burned' | 'retired';
  request_count: number;
  created_at: string;
}

interface CacheStats {
  totalFiles: number;
  totalSizeBytes: number;
  oldestFile?: string;
  newestFile?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function Settings() {
  // Settings state
  const [vkingKey, setVkingKey] = useState('');
  const [vkingTestStatus, setVkingTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [aiProvider, setAiProvider] = useState<'anthropic' | 'openai' | 'deepseek'>('deepseek');
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [crawlInterval, setCrawlInterval] = useState('6h');
  const [delayMin, setDelayMin] = useState(3);
  const [delayMax, setDelayMax] = useState(8);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Proxy form
  const [proxyProtocol, setProxyProtocol] = useState<'http' | 'https' | 'socks5'>('http');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [proxyUser, setProxyUser] = useState('');
  const [proxyPass, setProxyPass] = useState('');

  const { data: settings, invoke: loadSettings } = useIPC<SettingsData>('settings:get');
  const { invoke: updateSettings } = useIPC('settings:update');
  const { data: proxies, invoke: loadProxies } = useIPC<ProxyData[]>('proxy:list');
  const { invoke: addProxy } = useIPC('proxy:add');
  const { invoke: removeProxy } = useIPC('proxy:remove');
  const { invoke: testProxy } = useIPC('proxy:test');
  const { data: profiles, invoke: loadProfiles } = useIPC<ProfileData[]>('profile:list');
  const { data: cacheStats, invoke: loadCacheStats } = useIPC<CacheStats>('html-cache:stats');
  const { invoke: cleanupCache } = useIPC('html-cache:cleanup');
  const { invoke: testVkingApi } = useIPC('analytics:api-status');

  useEffect(() => {
    loadSettings();
    loadProxies();
    loadProfiles();
    loadCacheStats();
  }, []);

  useEffect(() => {
    if (settings) {
      setVkingKey(settings.vking_api_key ?? '');
      setAiProvider(settings.ai_provider ?? 'anthropic');
      setAiKey(settings.ai_api_key ?? '');
      setAiModel(settings.ai_model ?? '');
      setCrawlInterval(settings.crawl_interval ?? '6h');
      setDelayMin(settings.delay_min ?? 3);
      setDelayMax(settings.delay_max ?? 8);
      setTheme(settings.theme ?? 'dark');
    }
  }, [settings]);

  const handleSaveVking = async () => {
    await updateSettings({ vking_api_key: vkingKey });
  };

  const handleTestVking = async () => {
    setVkingTestStatus('testing');
    const result = await testVkingApi();
    setVkingTestStatus(result.success ? 'success' : 'failed');
  };

  const handleSaveAI = async () => {
    await updateSettings({ ai_provider: aiProvider, ai_api_key: aiKey, ai_model: aiModel });
  };

  const handleSaveCrawl = async () => {
    await updateSettings({ crawl_interval: crawlInterval, delay_min: delayMin, delay_max: delayMax });
  };

  const handleAddProxy = async () => {
    if (!proxyHost || !proxyPort) return;
    await addProxy({
      protocol: proxyProtocol,
      host: proxyHost,
      port: Number(proxyPort),
      username: proxyUser || undefined,
      password: proxyPass || undefined,
    });
    setProxyHost('');
    setProxyPort('');
    setProxyUser('');
    setProxyPass('');
    loadProxies();
  };

  const handleTestProxy = async (proxyId: number) => {
    await testProxy({ id: proxyId });
    loadProxies();
  };

  const handleRemoveProxy = async (proxyId: number) => {
    await removeProxy({ id: proxyId });
    loadProxies();
  };

  const handleCleanup = async () => {
    await cleanupCache();
    loadCacheStats();
  };

  const handleSaveTheme = async () => {
    await updateSettings({ theme });
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-100">Settings</h1>

      {/* VK1ng API */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-100">VK1ng API (HeyEtsy)</h2>
        <div>
          <label className="block text-sm text-gray-400 mb-1">API Key</label>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={vkingKey}
              onChange={(e) => setVkingKey(e.target.value)}
              placeholder="Enter your VK1ng API key"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              onClick={handleTestVking}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Test Connection
            </button>
          </div>
          {vkingTestStatus === 'success' && (
            <p className="text-sm text-green-400 mt-1">Connection successful</p>
          )}
          {vkingTestStatus === 'failed' && (
            <p className="text-sm text-red-400 mt-1">Connection failed. Check your API key.</p>
          )}
          {vkingTestStatus === 'testing' && (
            <p className="text-sm text-gray-400 mt-1">Testing...</p>
          )}
        </div>
        <button
          onClick={handleSaveVking}
          className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
        >
          Save
        </button>
      </div>

      {/* AI Configuration */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-100">AI Configuration</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Provider</label>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value as any)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="deepseek">DeepSeek</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Model</label>
            <input
              type="text"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder={aiProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">API Key</label>
          <input
            type="password"
            value={aiKey}
            onChange={(e) => setAiKey(e.target.value)}
            placeholder="Enter your API key"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleSaveAI}
          className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
        >
          Save
        </button>
      </div>

      {/* Crawl Settings */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-100">Crawl Settings</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Default Interval</label>
            <select
              value={crawlInterval}
              onChange={(e) => setCrawlInterval(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="1h">Every 1 hour</option>
              <option value="3h">Every 3 hours</option>
              <option value="6h">Every 6 hours</option>
              <option value="12h">Every 12 hours</option>
              <option value="24h">Every 24 hours</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Delay Min (sec)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={delayMin}
              onChange={(e) => setDelayMin(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Delay Max (sec)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={delayMax}
              onChange={(e) => setDelayMax(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>
        <button
          onClick={handleSaveCrawl}
          className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
        >
          Save
        </button>
      </div>

      {/* Proxy Management */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-100">Proxy Management</h2>

        {/* Add proxy form */}
        <div className="grid grid-cols-5 gap-2">
          <select
            value={proxyProtocol}
            onChange={(e) => setProxyProtocol(e.target.value as any)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
            <option value="socks5">SOCKS5</option>
          </select>
          <input
            type="text"
            placeholder="Host"
            value={proxyHost}
            onChange={(e) => setProxyHost(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <input
            type="text"
            placeholder="Port"
            value={proxyPort}
            onChange={(e) => setProxyPort(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <input
            type="text"
            placeholder="Username"
            value={proxyUser}
            onChange={(e) => setProxyUser(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <input
            type="password"
            placeholder="Password"
            value={proxyPass}
            onChange={(e) => setProxyPass(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleAddProxy}
          className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
        >
          Add Proxy
        </button>

        {/* Proxy table */}
        {(proxies ?? []).length > 0 && (
          <div className="rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-800">
                  <th className="text-left px-3 py-2 text-xs uppercase text-gray-400 font-medium">Proxy</th>
                  <th className="text-center px-3 py-2 text-xs uppercase text-gray-400 font-medium">Status</th>
                  <th className="text-center px-3 py-2 text-xs uppercase text-gray-400 font-medium">Fails</th>
                  <th className="text-right px-3 py-2 text-xs uppercase text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(proxies ?? []).map((proxy) => (
                  <tr key={proxy.id} className="border-t border-gray-700">
                    <td className="px-3 py-2 text-sm text-gray-300">
                      {proxy.protocol}://{proxy.host}:{proxy.port}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ProxyStatus status={proxy.status} />
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-400 text-center">{proxy.fail_count}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleTestProxy(proxy.id)}
                          className="px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                        >
                          Test
                        </button>
                        <button
                          onClick={() => handleRemoveProxy(proxy.id)}
                          className="px-2 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Browser Profiles */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Browser Profiles</h2>
          <button className="px-4 py-2 rounded-lg font-medium text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
            Clean Burned
          </button>
        </div>
        {(profiles ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">No browser profiles created yet.</p>
        ) : (
          <div className="space-y-2">
            {(profiles ?? []).map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded-lg"
              >
                <span className="text-sm text-gray-300 font-mono">{profile.id.slice(0, 12)}...</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{profile.request_count} requests</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      profile.status === 'active'
                        ? 'text-green-400 bg-green-500/10'
                        : profile.status === 'burned'
                        ? 'text-red-400 bg-red-500/10'
                        : 'text-gray-400 bg-gray-500/10'
                    }`}
                  >
                    {profile.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HTML Cache */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">HTML Cache</h2>
          <button
            onClick={handleCleanup}
            className="px-4 py-2 rounded-lg font-medium text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Cleanup
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400">Total Files</p>
            <p className="text-lg font-bold text-gray-100">{cacheStats?.totalFiles ?? 0}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400">Total Size</p>
            <p className="text-lg font-bold text-gray-100">
              {formatBytes(cacheStats?.totalSizeBytes ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-100">Theme</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="theme"
              value="dark"
              checked={theme === 'dark'}
              onChange={() => setTheme('dark')}
              className="text-indigo-500 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-300">Dark</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="theme"
              value="light"
              checked={theme === 'light'}
              onChange={() => setTheme('light')}
              className="text-indigo-500 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-300">Light</span>
          </label>
        </div>
        <button
          onClick={handleSaveTheme}
          className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
