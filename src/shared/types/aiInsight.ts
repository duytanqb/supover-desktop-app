export type AIInsightType =
  | 'shop_summary'
  | 'trend_alert'
  | 'keyword_suggestion'
  | 'niche_discovery'
  | 'strategy_change';

export interface AIInsight {
  id: number;
  insight_type: AIInsightType;
  shop_id: number | null;
  keyword_id: number | null;
  content: string;
  data_context: string | null;
  model_used: string | null;
  is_pinned: number;
  created_at: string;
}
