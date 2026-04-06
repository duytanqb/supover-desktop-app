import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIPC } from '../hooks/useIPC';
import { formatRelativeTime } from '../utils/formatTime';

interface Shop {
  id: number;
  shop_name: string;
  shop_url: string;
  status: 'active' | 'paused' | 'archived';
  priority: 'low' | 'normal' | 'high';
  total_listings: number;
  last_crawled: string | null;
  notes: string | null;
}

const statusStyles: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  archived: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const priorityStyles: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  normal: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  low: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export default function ShopList() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  // Form state
  const [formUrl, setFormUrl] = useState('');
  const [formPriority, setFormPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [formNotes, setFormNotes] = useState('');

  const { data: shops, invoke: loadShops, loading } = useIPC<Shop[]>('shop:list');
  const { invoke: addShop } = useIPC('shop:add');
  const { invoke: crawlNow } = useIPC('shop:crawl-now');
  const { invoke: updateShop } = useIPC('shop:update');

  useEffect(() => {
    loadShops();
  }, []);

  const handleAdd = async () => {
    if (!formUrl.trim()) return;
    const result = await addShop({ url: formUrl, priority: formPriority, notes: formNotes || null });
    if (result.success) {
      setFormUrl('');
      setFormNotes('');
      setFormPriority('normal');
      setShowForm(false);
      loadShops();
    }
  };

  const handleCrawlNow = async (shopId: number) => {
    await crawlNow({ shopId });
  };

  const handleTogglePause = async (shop: Shop) => {
    const newStatus = shop.status === 'active' ? 'paused' : 'active';
    await updateShop({ id: shop.id, status: newStatus });
    loadShops();
  };

  const handleArchive = async (shopId: number) => {
    await updateShop({ id: shopId, status: 'archived' });
    loadShops();
  };

  const filtered = (shops ?? []).filter(
    (s) =>
      s.shop_name.toLowerCase().includes(search.toLowerCase()) ||
      s.shop_url.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">Shops</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Cancel' : 'Add Shop'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Shop URL</label>
            <input
              type="text"
              placeholder="https://www.etsy.com/shop/ShopName"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Priority</label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as any)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Notes</label>
            <textarea
              placeholder="Optional notes..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>
          <button
            onClick={handleAdd}
            className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
          >
            Add Shop
          </button>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Filter shops..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800">
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium">Shop Name</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Status</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Priority</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">Last Crawled</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">Listings</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !shops ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                  No shops found. Add your first shop to get started.
                </td>
              </tr>
            ) : (
              filtered.map((shop, idx) => (
                <tr
                  key={shop.id}
                  className={`border-t border-gray-800 hover:bg-gray-800/50 transition-colors ${
                    idx % 2 === 1 ? 'bg-gray-900/50' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/shops/${shop.id}`)}
                      className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {shop.shop_name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold border ${statusStyles[shop.status]}`}>
                      {shop.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold border ${priorityStyles[shop.priority]}`}>
                      {shop.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 text-right">
                    {formatRelativeTime(shop.last_crawled)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 text-right">
                    {shop.total_listings}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleCrawlNow(shop.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors"
                      >
                        Crawl Now
                      </button>
                      <button
                        onClick={() => handleTogglePause(shop)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                      >
                        {shop.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => handleArchive(shop.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
