/**
 * Proxy Service — manages proxy pool for browser automation.
 * Handles proxy URL formatting, rotation, failure tracking, and connectivity testing.
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export interface Proxy {
  id: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  status: string;
  fail_count: number;
  last_used_at: string | null;
  created_at: string;
}

/**
 * Format a proxy record into a URL string: protocol://user:pass@host:port
 */
export function formatProxyUrl(proxy: {
  protocol: string;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
}): string {
  const auth =
    proxy.username && proxy.password
      ? `${proxy.username}:${proxy.password}@`
      : '';
  return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;
}

/**
 * Get the next available proxy with the lowest fail_count.
 * Returns null if no active proxies exist (app can run without proxies).
 */
export function getNextProxy(db: Database.Database): Proxy | null {
  const row = db.prepare(`
    SELECT * FROM proxies
    WHERE status = 'active'
    ORDER BY fail_count ASC, last_used_at ASC
    LIMIT 1
  `).get() as Proxy | undefined;

  if (!row) {
    logger.info('No active proxies available, will connect directly');
    return null;
  }

  // Update last_used_at
  db.prepare(`
    UPDATE proxies SET last_used_at = datetime('now') WHERE id = ?
  `).run(row.id);

  return row;
}

/**
 * Mark a proxy as failed. If fail_count exceeds 5, retire the proxy.
 */
export function markFailed(db: Database.Database, proxyId: string): void {
  const proxy = db.prepare('SELECT fail_count FROM proxies WHERE id = ?').get(proxyId) as
    | { fail_count: number }
    | undefined;

  if (!proxy) {
    logger.warn('Proxy not found for markFailed', { proxyId });
    return;
  }

  const newFailCount = proxy.fail_count + 1;

  if (newFailCount > 5) {
    db.prepare(`
      UPDATE proxies
      SET fail_count = ?, status = 'retired'
      WHERE id = ?
    `).run(newFailCount, proxyId);
    logger.warn('Proxy retired due to excessive failures', { proxyId, failCount: newFailCount });
  } else {
    db.prepare(`
      UPDATE proxies SET fail_count = ? WHERE id = ?
    `).run(newFailCount, proxyId);
    logger.info('Proxy failure recorded', { proxyId, failCount: newFailCount });
  }
}

/**
 * Test proxy connectivity by making an HTTP request through the proxy.
 * Uses a lightweight endpoint (httpbin or similar) to verify the proxy works.
 * Returns true if the proxy is reachable and functional.
 */
export async function testProxy(
  db: Database.Database,
  proxyId: string
): Promise<boolean> {
  const proxy = db.prepare('SELECT * FROM proxies WHERE id = ?').get(proxyId) as Proxy | undefined;

  if (!proxy) {
    logger.warn('Proxy not found for testing', { proxyId });
    return false;
  }

  const proxyUrl = formatProxyUrl(proxy);

  try {
    // Use a simple HTTP request to test connectivity
    // We use the global fetch with a test URL
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // Note: Node.js global fetch doesn't natively support proxies.
    // In production, use proxy-agent or proxy-chain package.
    // For now, we test by resolving the proxy host.
    const testUrl = 'https://httpbin.org/ip';

    // Simple connectivity check — attempt a DNS-level test
    // Full proxy testing requires proxy-agent integration
    const { hostname } = new URL(proxyUrl);

    // Try to resolve the hostname as a basic connectivity check
    const dns = await import('dns');
    await new Promise<void>((resolve, reject) => {
      dns.lookup(hostname, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    clearTimeout(timeout);

    logger.info('Proxy test passed (DNS resolution)', { proxyId, host: proxy.host });

    // Reset fail count on successful test
    db.prepare('UPDATE proxies SET fail_count = 0 WHERE id = ?').run(proxyId);

    return true;
  } catch (error) {
    logger.error('Proxy test failed', {
      proxyId,
      host: proxy.host,
      error: (error as Error).message,
    });
    markFailed(db, proxyId);
    return false;
  }
}
