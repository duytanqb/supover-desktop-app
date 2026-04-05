import { useState, useEffect } from 'react';
import { useIPC } from '../hooks/useIPC';
import TrendBadge from '../components/TrendBadge';

interface TrendingItem {
  id: number;
  etsy_listing_id: string;
  title: string | null;
  image_url: string | null;
  shop_name: string | null;
  price: number | null;
  sold_24h: number;
  views_24h: number;
  hey_score: number;
  trending_score: number;
  trend_status: 'HOT' | 'WATCH' | 'SKIP';
  days_old: number;
  total_sold: number;
  conversion_rate: number;
  tags: string;
  qualified: number;
  fetched_at: string;
}

interface TrendingResponse {
  listings: TrendingItem[];
  total: number;
  page: number;
  pageSize: number;
}

export default function TrendingBoard() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'HOT' | 'WATCH'>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, loading, invoke } = useIPC<TrendingResponse>('analytics:trending');

  useEffect(() => {
    invoke({ status: statusFilter === 'ALL' ? undefined : statusFilter, search, page, pageSize });
  }, [statusFilter, page]);

  const listings = data?.listings ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const filtered = search
    ? listings.filter(
        (item) =>
          (item.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (item.shop_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (item.etsy_listing_id ?? '').includes(search) ||
          (item.tags ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : listings;

  const openListing = (etsyListingId: string) => {
    window.electron.ipcRenderer.invoke('shell:open-external', `https://www.etsy.com/listing/${etsyListingId}`);
    // Fallback: open via window.open if shell handler doesn't exist
    window.open(`https://www.etsy.com/listing/${etsyListingId}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">Trending Board</h1>
        <span className="text-sm text-gray-500">{total} trending listings</span>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as 'ALL' | 'HOT' | 'WATCH');
            setPage(1);
          }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="HOT">HOT Only</option>
          <option value="WATCH">WATCH Only</option>
        </select>

        <input
          type="text"
          placeholder="Search by title, shop, listing ID, or tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800">
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium w-10">#</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium">Listing ID</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium">Title</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium">Shop</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">Price</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">Sold 24h</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">Views 24h</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">HEY</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium">Score</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500 text-sm">
                  No trending listings found. Crawl keywords or shops to discover trends.
                </td>
              </tr>
            ) : (
              filtered.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`border-t border-gray-800 hover:bg-gray-800/50 transition-colors ${
                    idx % 2 === 1 ? 'bg-gray-900/50' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {(page - 1) * pageSize + idx + 1}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openListing(item.etsy_listing_id)}
                      className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline font-mono transition-colors"
                      title={`Open listing ${item.etsy_listing_id} on Etsy`}
                    >
                      {item.etsy_listing_id}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <button
                        onClick={() => openListing(item.etsy_listing_id)}
                        className="text-sm text-gray-200 hover:text-indigo-300 hover:underline truncate max-w-xs block text-left transition-colors"
                        title={item.title || undefined}
                      >
                        {item.title || `Listing #${item.etsy_listing_id}`}
                      </button>
                      <div className="text-xs text-gray-500">
                        {item.days_old}d old · {item.total_sold} total sold
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{item.shop_name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-100 text-right font-medium">
                    ${(item.price ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={item.sold_24h >= 3 ? 'text-green-400 font-medium' : 'text-gray-400'}>
                      {item.sold_24h}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={item.views_24h >= 120 ? 'text-green-400 font-medium' : 'text-gray-400'}>
                      {item.views_24h}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={item.hey_score >= 8 ? 'text-green-400 font-medium' : 'text-gray-400'}>
                      {item.hey_score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-indigo-400 text-right font-medium">
                    {item.trending_score.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TrendBadge status={item.trend_status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {filtered.length} of {total} listings
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
