export type TrendStatus = 'HOT' | 'WATCH' | 'SKIP';

export interface VkingListingData {
  etsy_listing_id: string;
  sold_24h: number;
  views_24h: number;
  hey_score: number;
  days_old: number;
  total_sold: number;
  estimated_revenue: string;
  conversion_rate: number;
  num_favorers: number;
  daily_views: number;
  total_views: number;
  tags: string | null;
  categories: string | null;
  shop_country: string | null;
  shop_sold: number | null;
}

export interface VkingSubscriptionStatus {
  connected: boolean;
  plan?: string;
  remaining_credits?: number;
  expires_at?: string;
}

export interface QualificationResult {
  qualified: boolean;
  reasons: string[];
  rules: Record<string, boolean>;
}

export interface ListingAnalytics {
  id: number;
  listing_id: number;
  etsy_listing_id: string;
  sold_24h: number;
  views_24h: number;
  hey_score: number;
  days_old: number;
  total_sold: number;
  estimated_revenue: string | null;
  conversion_rate: number;
  num_favorers: number;
  daily_views: number;
  total_views: number;
  trending_score: number;
  trend_status: TrendStatus;
  qualified: number;
  qualified_by: string | null;
  tags: string | null;
  categories: string | null;
  shop_country: string | null;
  shop_sold: number | null;
  fetched_at: string;
  crawl_job_id: number | null;
}
