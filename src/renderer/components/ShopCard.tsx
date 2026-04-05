import { formatRelativeTime } from '../utils/formatTime';

export interface ShopData {
  id: number;
  shop_name: string;
  shop_url: string;
  status: 'active' | 'paused' | 'archived';
  priority: 'low' | 'normal' | 'high';
  total_listings?: number;
  last_crawled?: string | null;
  notes?: string | null;
}

interface ShopCardProps {
  shop: ShopData;
  onClick?: () => void;
}

const statusStyles: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  archived: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export default function ShopCard({ shop, onClick }: ShopCardProps) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg hover:bg-gray-800/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-100">{shop.shop_name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {shop.total_listings ?? 0} listings
          {shop.last_crawled && (
            <span> &middot; Crawled {formatRelativeTime(shop.last_crawled)}</span>
          )}
        </p>
      </div>
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border ${statusStyles[shop.status]}`}
      >
        {shop.status}
      </span>
    </div>
  );
}
