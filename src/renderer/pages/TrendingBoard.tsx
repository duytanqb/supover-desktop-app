import { useState, useEffect } from 'react';
import { useIPC } from '../hooks/useIPC';
import TrendBadge from '../components/TrendBadge';
import { formatRelativeTime } from '../utils/formatTime';

interface TrendingItem {
  id: number;
  etsy_listing_id: string;
  title: string | null;
  image_url: string | null;
  shop_name: string | null;
  sold_24h: number;
  views_24h: number;
  hey_score: number;
  trending_score: number;
  trend_status: 'HOT' | 'WATCH' | 'SKIP';
  days_old: number;
  total_sold: number;
  conversion_rate: number;
  tags: string;
  fetched_at: string;
}

interface TrendingResponse {
  listings: TrendingItem[];
  total: number;
  page: number;
  pageSize: number;
}

type SortField = 'latest' | 'score' | 'sold_24h' | 'views_24h' | 'hey_score';

const PRODUCT_TYPES = [
  { value: 'all', label: 'All Products' },
  { value: 'shirt', label: 'Shirt / Tee' },
  { value: 'hoodie', label: 'Hoodie' },
  { value: 'sweater', label: 'Sweater' },
  { value: 'sweatshirt', label: 'Sweatshirt' },
  { value: 'tumbler', label: 'Tumbler' },
  { value: 'mug', label: 'Mug' },
  { value: 'poster', label: 'Poster' },
];

// Keywords that match each product type (checked against title + tags)
const PRODUCT_KEYWORDS: Record<string, string[]> = {
  shirt: ['shirt', 'tshirt', 't-shirt', 'tee'],
  hoodie: ['hoodie'],
  sweater: ['sweater'],
  sweatshirt: ['sweatshirt'],
  tumbler: ['tumbler'],
  mug: ['mug', 'cup'],
  poster: ['poster', 'print', 'wall art', 'canvas'],
};

export default function TrendingBoard() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'HOT' | 'WATCH'>('ALL');
  const [productType, setProductType] = useState('all');
  const [sortBy, setSortBy] = useState<SortField>('latest');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, loading, invoke } = useIPC<TrendingResponse>('analytics:trending');

  useEffect(() => {
    invoke({ status: statusFilter === 'ALL' ? undefined : statusFilter, productType, sortBy, page, pageSize });
  }, [statusFilter, productType, sortBy, page]);

  const listings = data?.listings ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Client-side filtering: search text + product type
  let filtered = listings;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        (item.title ?? '').toLowerCase().includes(q) ||
        (item.etsy_listing_id ?? '').includes(q) ||
        (item.tags ?? '').toLowerCase().includes(q)
    );
  }
  if (productType !== 'all') {
    const keywords = PRODUCT_KEYWORDS[productType] || [];
    filtered = filtered.filter((item) => {
      const text = ((item.title ?? '') + ' ' + (item.tags ?? '')).toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    });
  }

  const openListing = (etsyListingId: string) => {
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
          onChange={(e) => { setStatusFilter(e.target.value as 'ALL' | 'HOT' | 'WATCH'); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="HOT">HOT Only</option>
          <option value="WATCH">WATCH Only</option>
        </select>

        <select
          value={productType}
          onChange={(e) => { setProductType(e.target.value); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        >
          {PRODUCT_TYPES.map((pt) => (
            <option key={pt.value} value={pt.value}>{pt.label}</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value as SortField); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        >
          <option value="latest">Latest Crawl</option>
          <option value="score">Trending Score</option>
          <option value="sold_24h">Sold 24h</option>
          <option value="views_24h">Views 24h</option>
          <option value="hey_score">HEY Score</option>
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
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800">
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium w-10">#</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium w-14">Img</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium whitespace-nowrap">Listing ID</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium">Title</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium whitespace-nowrap">Sold 24h</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium whitespace-nowrap">Views 24h</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium whitespace-nowrap">HEY</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium whitespace-nowrap">Score</th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium whitespace-nowrap">Status</th>
              <th className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium whitespace-nowrap">Fetched</th>
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
                  <td className="px-2 py-2">
                    <div className="w-10 h-10 rounded bg-gray-800 overflow-hidden flex-shrink-0">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">—</div>
                      )}
                    </div>
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
                        className="text-sm text-gray-200 hover:text-indigo-300 hover:underline truncate max-w-md block text-left transition-colors"
                        title={item.title || undefined}
                      >
                        {item.title || `Listing #${item.etsy_listing_id}`}
                      </button>
                      <div className="text-xs text-gray-500">
                        {item.days_old}d old · {item.total_sold} total sold
                      </div>
                    </div>
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
                  <td className="px-4 py-3 text-xs text-gray-500 text-right whitespace-nowrap">
                    {formatRelativeTime(item.fetched_at)}
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
