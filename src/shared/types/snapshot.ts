export interface SearchSnapshot {
  id: number;
  keyword_id: number;
  etsy_listing_id: string;
  shop_name: string | null;
  title: string | null;
  price: number | null;
  sale_price: number | null;
  currency: string;
  image_url: string | null;
  rating: number | null;
  review_count: number | null;
  is_bestseller: number;
  is_ad: number;
  is_free_shipping: number;
  position_in_search: number | null;
  page_number: number | null;
  crawled_at: string;
  crawl_job_id: number | null;
}
