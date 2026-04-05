import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useIPC } from '../hooks/useIPC';
import TrendBadge from '../components/TrendBadge';
import AnalyticsPanel from '../components/AnalyticsPanel';
import SnapshotTimeline from '../components/SnapshotTimeline';
import { formatRelativeTime } from '../utils/formatTime';

interface ShopInfo {
  id: number;
  shop_name: string;
  shop_url: string;
  status: string;
  priority: string;
  total_sales?: number;
  total_reviews?: number;
  admirers?: number;
  total_listings: number;
  last_crawled: string | null;
}

interface ListingRow {
  id: number;
  etsyListingId: string;
  title: string;
  imageUrl?: string | null;
  price: number;
  originalPrice?: number | null;
  trendStatus?: 'HOT' | 'WATCH' | 'SKIP';
  sold24h?: number;
  views24h?: number;
  heyScore?: number;
  trendingScore?: number;
  conversionRate?: number;
  daysOld?: number;
}

interface ShopDetailData {
  shop: ShopInfo;
  listings: ListingRow[];
}

interface SnapshotData {
  snapshots: { id: number; date: string }[];
}

export default function ShopDetail() {
  const { id } = useParams<{ id: string }>();
  const [selectedListing, setSelectedListing] = useState<ListingRow | null>(null);
  const [sortField, setSortField] = useState<'trendingScore' | 'sold24h' | 'views24h' | 'price'>('trendingScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data, loading, invoke: loadShop } = useIPC<ShopDetailData>('shop:get');
  const { invoke: crawlNow } = useIPC('shop:crawl-now');
  const { invoke: analyzeShop } = useIPC('ai:analyze-shop');
  const { data: snapshotData, invoke: loadSnapshots } = useIPC<SnapshotData>('snapshot:shop-history');

  useEffect(() => {
    if (id) {
      loadShop({ id: Number(id) });
      loadSnapshots({ shopId: Number(id) });
    }
  }, [id]);

  const shop = data?.shop;
  const listings = data?.listings ?? [];

  const sorted = [...listings].sort((a, b) => {
    const aVal = (a as any)[sortField] ?? 0;
    const bVal = (b as any)[sortField] ?? 0;
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortIcon = (field: string) => {
    if (sortField !== field) return '';
    return sortDir === 'desc' ? ' \u25BC' : ' \u25B2';
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading shop details...</p>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Shop not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">{shop.shop_name}</h1>
            <a
              href={shop.shop_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-400 hover:text-indigo-300 mt-1 inline-block"
            >
              {shop.shop_url}
            </a>
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
              {shop.total_sales != null && (
                <span>{shop.total_sales.toLocaleString()} sales</span>
              )}
              {shop.total_reviews != null && (
                <span>{shop.total_reviews.toLocaleString()} reviews</span>
              )}
              {shop.admirers != null && (
                <span>{shop.admirers.toLocaleString()} admirers</span>
              )}
              <span>{shop.total_listings} listings</span>
              <span>Last crawled: {formatRelativeTime(shop.last_crawled)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => crawlNow({ shopId: shop.id })}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-indigo-500 text-white hover:opacity-90 transition-opacity"
            >
              Crawl Now
            </button>
            <button
              onClick={() => analyzeShop({ shopId: shop.id })}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-purple-500 text-white hover:opacity-90 transition-opacity"
            >
              AI Analyze
            </button>
          </div>
        </div>

        {/* Snapshot timeline */}
        {snapshotData?.snapshots && snapshotData.snapshots.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-2">Snapshot History</p>
            <SnapshotTimeline snapshots={snapshotData.snapshots} />
          </div>
        )}
      </div>

      {/* Selected listing analytics */}
      {selectedListing && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-100 truncate">
              {selectedListing.title}
            </h2>
            <button
              onClick={() => setSelectedListing(null)}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              Close
            </button>
          </div>
          <AnalyticsPanel
            analytics={{
              sold_24h: selectedListing.sold24h,
              views_24h: selectedListing.views24h,
              hey_score: selectedListing.heyScore,
              trending_score: selectedListing.trendingScore,
              conversion_rate: selectedListing.conversionRate,
              days_old: selectedListing.daysOld,
            }}
          />
        </div>
      )}

      {/* Listings table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-gray-100">
            Listings ({listings.length})
          </h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800">
              <th className="text-left px-4 py-3 text-xs uppercase text-gray-400 font-medium">Listing</th>
              <th
                className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium cursor-pointer hover:text-gray-200"
                onClick={() => handleSort('price')}
              >
                Price{sortIcon('price')}
              </th>
              <th
                className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium cursor-pointer hover:text-gray-200"
                onClick={() => handleSort('sold24h')}
              >
                Sold 24h{sortIcon('sold24h')}
              </th>
              <th
                className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium cursor-pointer hover:text-gray-200"
                onClick={() => handleSort('views24h')}
              >
                Views 24h{sortIcon('views24h')}
              </th>
              <th
                className="text-right px-4 py-3 text-xs uppercase text-gray-400 font-medium cursor-pointer hover:text-gray-200"
                onClick={() => handleSort('trendingScore')}
              >
                Score{sortIcon('trendingScore')}
              </th>
              <th className="text-center px-4 py-3 text-xs uppercase text-gray-400 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                  No listings found. Crawl the shop to fetch listings.
                </td>
              </tr>
            ) : (
              sorted.map((listing, idx) => (
                <tr
                  key={listing.id}
                  className={`border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors ${
                    selectedListing?.id === listing.id ? 'bg-gray-800/70' : idx % 2 === 1 ? 'bg-gray-900/50' : ''
                  }`}
                  onClick={() => setSelectedListing(listing)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-gray-800 flex-shrink-0 overflow-hidden">
                        {listing.imageUrl ? (
                          <img src={listing.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                            N/A
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-gray-200 truncate max-w-md">{listing.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-100 text-right font-medium">
                    ${listing.price.toFixed(2)}
                    {listing.originalPrice != null && listing.originalPrice !== listing.price && (
                      <span className="text-xs text-gray-500 line-through ml-1">
                        ${listing.originalPrice.toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={(listing.sold24h ?? 0) >= 3 ? 'text-green-400 font-medium' : 'text-gray-400'}>
                      {listing.sold24h ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={(listing.views24h ?? 0) >= 120 ? 'text-green-400 font-medium' : 'text-gray-400'}>
                      {listing.views24h ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-indigo-400 text-right font-medium">
                    {(listing.trendingScore ?? 0).toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {listing.trendStatus ? (
                      <TrendBadge status={listing.trendStatus} />
                    ) : (
                      <span className="text-xs text-gray-500">-</span>
                    )}
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
