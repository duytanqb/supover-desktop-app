import { useState, useEffect } from 'react';
import { useIPC } from '../hooks/useIPC';
import TrendBadge from '../components/TrendBadge';

interface TrendingListing {
  id: number;
  etsyListingId: string;
  title: string;
  imageUrl?: string | null;
  shopName: string;
  price: number;
  sold24h: number;
  views24h: number;
  heyScore: number;
  trendingScore: number;
  trendStatus: 'HOT' | 'WATCH' | 'SKIP';
}

interface TrendingResponse {
  listings: TrendingListing[];
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
  }, [statusFilter, search, page]);

  const listings = data?.listings ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold text-gray-100">Trending Board</h1>

      {/* Filter bar */}
      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as any);
            setPage(1);
          }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          <option value="ALL">All Statuses</option>
          <option value="HOT">HOT Only</option>
          <option value="WATCH">WATCH Only</option>
        </select>

        <input
          type="text"
          placeholder="Search listings..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800">
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium w-10">#</th>
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium">Listing</th>
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
            {loading && listings.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Loading...
                </td>
              </tr>
            ) : listings.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500 text-sm">
                  No trending listings found. Start tracking shops and keywords to discover trends.
                </td>
              </tr>
            ) : (
              listings.map((item, idx) => (
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
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-gray-800 flex-shrink-0 overflow-hidden">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                            N/A
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-gray-200 truncate max-w-xs">{item.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{item.shopName}</td>
                  <td className="px-4 py-3 text-sm text-gray-100 text-right font-medium">
                    ${item.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={item.sold24h >= 3 ? 'text-green-400 font-medium' : 'text-gray-400'}>
                      {item.sold24h}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={item.views24h >= 120 ? 'text-green-400 font-medium' : 'text-gray-400'}>
                      {item.views24h}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={item.heyScore >= 8 ? 'text-green-400 font-medium' : 'text-gray-400'}>
                      {item.heyScore}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-indigo-400 text-right font-medium">
                    {item.trendingScore.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TrendBadge status={item.trendStatus} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {listings.length} of {total} listings
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
    </div>
  );
}
