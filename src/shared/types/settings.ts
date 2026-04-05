export type SettingsKey =
  | 'vking_api_key'
  | 'vking_base_url'
  | 'vking_cache_hours'
  | 'vking_bulk_batch_size'
  | 'ai_provider'
  | 'ai_api_key'
  | 'ai_model'
  | 'default_crawl_interval'
  | 'max_concurrent_tabs'
  | 'page_view_limit_per_hour'
  | 'min_delay_seconds'
  | 'max_delay_seconds'
  | 'auto_create_profile_on_block'
  | 'pause_on_consecutive_blocks'
  | 'pause_duration_minutes'
  | 'snapshot_retention_days'
  | 'html_cache_retention_days'
  | 'theme'
  | 'onboarding_completed';

export type AppSettings = Record<SettingsKey, string>;
