export type ProxyProtocol = 'http' | 'https' | 'socks5';
export type ProxyStatus = 'active' | 'failed' | 'retired';

export interface Proxy {
  id: string;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  status: ProxyStatus;
  fail_count: number;
  last_used_at: string | null;
  created_at: string;
}
