export type CrawlJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';

export interface CrawlJob {
  id: number;
  job_type: string;
  target_id: number;
  profile_id: string | null;
  proxy_used: string | null;
  status: CrawlJobStatus;
  pages_crawled: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CrawlResult {
  success: boolean;
  listingsFound: number;
  pagesProcessed: number;
  errors?: string[];
}
