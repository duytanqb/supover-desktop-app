import TrendBadge from './TrendBadge';
import { formatRelativeTime } from '../utils/formatTime';

export interface ListingData {
  id: number;
  etsyListingId: string;
  title: string;
  imageUrl?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  trendStatus?: 'HOT' | 'WATCH' | 'SKIP';
  sold24h?: number;
  views24h?: number;
  heyScore?: number;
  shopName?: string;
  lastSeen?: string;
}

interface ListingCardProps {
  listing: ListingData;
  onClick?: () => void;
}

export default function ListingCard({ listing, onClick }: ListingCardProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg hover:bg-gray-800/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-md overflow-hidden bg-gray-800 flex-shrink-0">
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
            N/A
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100 truncate">{listing.title}</p>
        <div className="flex items-center gap-2 mt-1">
          {listing.price != null && (
            <span className="text-sm font-bold text-gray-100">
              ${listing.price.toFixed(2)}
            </span>
          )}
          {listing.originalPrice != null && listing.originalPrice !== listing.price && (
            <span className="text-xs text-gray-500 line-through">
              ${listing.originalPrice.toFixed(2)}
            </span>
          )}
          {listing.shopName && (
            <span className="text-xs text-gray-500">{listing.shopName}</span>
          )}
        </div>
      </div>

      {/* Trend */}
      {listing.trendStatus && (
        <div className="flex-shrink-0">
          <TrendBadge status={listing.trendStatus} />
        </div>
      )}

      {/* Quick stats */}
      <div className="flex-shrink-0 text-right">
        {listing.sold24h != null && (
          <p className="text-xs text-gray-400">
            <span className="text-green-400 font-medium">{listing.sold24h}</span> sold
          </p>
        )}
        {listing.views24h != null && (
          <p className="text-xs text-gray-400">
            <span className="text-blue-400 font-medium">{listing.views24h}</span> views
          </p>
        )}
      </div>
    </div>
  );
}
