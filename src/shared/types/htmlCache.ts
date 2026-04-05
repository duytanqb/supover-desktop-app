export type PageType = 'shop_index' | 'search_index' | 'tag_index';
export type ParseStatus = 'pending' | 'parsed' | 'error';

export interface HtmlCacheRecord {
  id: number;
  page_type: PageType;
  target_id: number | null;
  target_name: string;
  page_number: number;
  file_path: string;
  file_size_bytes: number | null;
  parse_status: ParseStatus;
  parse_error: string | null;
  listings_found: number;
  crawl_job_id: number | null;
  crawled_at: string;
  parsed_at: string | null;
  expires_at: string | null;
}

export interface CacheStats {
  totalFiles: number;
  totalSizeBytes: number;
  oldestFile: string | null;
  newestFile: string | null;
}

export interface ParseResult {
  success: boolean;
  listingsFound: number;
  errors?: string[];
}
