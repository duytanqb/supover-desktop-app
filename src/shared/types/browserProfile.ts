export type ProfileStatus = 'active' | 'burned' | 'retired';

export interface BrowserProfile {
  id: string;
  profile_path: string;
  proxy_id: string | null;
  status: ProfileStatus;
  total_requests: number;
  last_used_at: string | null;
  burned_at: string | null;
  burn_reason: string | null;
  created_at: string;
}
