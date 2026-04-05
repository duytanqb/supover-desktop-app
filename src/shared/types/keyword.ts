export type ExpansionSource = 'user_input' | 'tag_expansion' | 'ai_suggest' | 'sibling_family';
export type KeywordStatus = 'active' | 'paused' | 'archived';

export interface SearchKeyword {
  id: number;
  keyword: string;
  category: string | null;
  crawl_interval_minutes: number;
  max_pages: number;
  status: KeywordStatus;
  notes: string | null;
  parent_keyword_id: number | null;
  expansion_source: ExpansionSource;
  source_listing_id: string | null;
  depth: number;
  is_saturated: number;
  auto_expand: number;
  created_at: string;
}
