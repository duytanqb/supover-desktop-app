import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

/**
 * Scheduler Service — automatically crawls shops and keywords on their configured intervals.
 * Executes crawls directly (not just queuing), handles block detection and auto-pause.
 */

export interface SchedulerStatus {
  isRunning: boolean;
  isPaused: boolean;
  isBlackout: boolean;
  consecutiveBlocks: number;
  currentTarget: string | null;
  nextCheckIn: number; // seconds until next check
  queueLength: number;
}

interface DueTarget {
  type: 'shop_index' | 'search_index';
  targetId: number;
  name: string;
  priority: string;
}

let schedulerInstance: SchedulerService | null = null;

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isPaused = false;
  private isCrawling = false;
  private consecutiveBlocks = 0;
  private pauseTimer: NodeJS.Timeout | null = null;
  private currentTarget: string | null = null;
  private lastCheckTime = 0;
  private checkIntervalMs = 60_000; // 60 seconds
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  start(): void {
    if (this.timer) return;

    this.isRunning = true;
    this.lastCheckTime = Date.now();
    this.timer = setInterval(() => {
      this.tick();
    }, this.checkIntervalMs);

    logger.info('Scheduler started (check every 60s)');

    // Run first check after a short delay (let app fully init)
    setTimeout(() => this.tick(), 5000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    this.isCrawling = false;
    this.currentTarget = null;
    logger.info('Scheduler stopped');
  }

  /**
   * Check if current time is in the blackout window.
   * HeyEtsy resets data between 12:00–21:00 Vietnam time (UTC+7),
   * so crawling during this period yields bad data for trend detection.
   */
  private isBlackoutPeriod(): boolean {
    const now = new Date();
    // Vietnam is UTC+7
    const vnHour = (now.getUTCHours() + 7) % 24;
    // Blackout: 12:00 to 21:00 VN time
    return vnHour >= 12 && vnHour < 21;
  }

  private tick(): void {
    if (this.isPaused || this.isCrawling) return;

    if (this.isBlackoutPeriod()) {
      const now = new Date();
      const vnHour = (now.getUTCHours() + 7) % 24;
      logger.info(`Scheduler skipping: blackout period (VN time: ${vnHour}:00, active 21:00-12:00)`);
      return;
    }

    this.lastCheckTime = Date.now();
    this.processNextDue().catch(err => {
      logger.error('Scheduler tick error', { error: (err as Error).message });
    });
  }

  private getDueTargets(): DueTarget[] {
    const targets: DueTarget[] = [];

    // Shops due for crawl
    const dueShops = this.db.prepare(`
      SELECT s.id, s.shop_name, s.priority
      FROM shops s
      WHERE s.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM crawl_jobs cj
          WHERE cj.job_type = 'shop_index'
            AND cj.target_id = s.id
            AND cj.status IN ('completed', 'running')
            AND cj.completed_at > datetime('now', '-' || s.crawl_interval_minutes || ' minutes')
        )
      ORDER BY
        CASE s.priority WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC
    `).all() as Array<{ id: number; shop_name: string; priority: string }>;

    for (const shop of dueShops) {
      targets.push({ type: 'shop_index', targetId: shop.id, name: shop.shop_name, priority: shop.priority });
    }

    // Keywords due for crawl
    const dueKeywords = this.db.prepare(`
      SELECT sk.id, sk.keyword
      FROM search_keywords sk
      WHERE sk.status = 'active'
        AND sk.is_saturated = 0
        AND NOT EXISTS (
          SELECT 1 FROM crawl_jobs cj
          WHERE cj.job_type = 'search_index'
            AND cj.target_id = sk.id
            AND cj.status IN ('completed', 'running')
            AND cj.completed_at > datetime('now', '-' || sk.crawl_interval_minutes || ' minutes')
        )
      ORDER BY sk.depth ASC, sk.created_at ASC
    `).all() as Array<{ id: number; keyword: string }>;

    for (const kw of dueKeywords) {
      targets.push({ type: 'search_index', targetId: kw.id, name: kw.keyword, priority: 'normal' });
    }

    return targets;
  }

  private async processNextDue(): Promise<void> {
    const targets = this.getDueTargets();
    if (targets.length === 0) return;

    // Process one target at a time
    const target = targets[0];
    this.isCrawling = true;
    this.currentTarget = `${target.type === 'shop_index' ? 'Shop' : 'Keyword'}: ${target.name}`;

    logger.info('Scheduler crawling', { type: target.type, name: target.name, queueRemaining: targets.length - 1 });

    try {
      const { crawlShop, crawlSearch } = await import('./crawlService.js');

      if (target.type === 'shop_index') {
        await crawlShop(this.db, target.targetId);
      } else {
        await crawlSearch(this.db, target.targetId);
      }

      this.consecutiveBlocks = 0;
      logger.info('Scheduler crawl completed', { type: target.type, name: target.name });
    } catch (error) {
      const errMsg = (error as Error).message;

      if (errMsg.includes('Blocked') || errMsg.includes('blocked')) {
        this.consecutiveBlocks++;
        logger.warn('Scheduler: crawl blocked', { consecutiveBlocks: this.consecutiveBlocks, target: target.name });

        const pauseThreshold = parseInt(this.getSetting('pause_on_consecutive_blocks', '3'));
        if (this.consecutiveBlocks >= pauseThreshold) {
          const pauseMinutes = parseInt(this.getSetting('pause_duration_minutes', '30'));
          this.pause(pauseMinutes);

          // Create alert
          try {
            this.db.prepare(
              "INSERT INTO alerts (alert_type, severity, old_value, new_value) VALUES ('scheduler_auto_pause', 'important', ?, ?)"
            ).run(String(this.consecutiveBlocks), `Auto-paused for ${pauseMinutes} minutes after ${this.consecutiveBlocks} consecutive blocks`);
          } catch { /* non-critical */ }
        }
      } else {
        logger.error('Scheduler crawl failed', { target: target.name, error: errMsg });
      }
    } finally {
      this.isCrawling = false;
      this.currentTarget = null;
    }
  }

  private getSetting(key: string, defaultValue: string): string {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? defaultValue;
  }

  pause(minutes: number): void {
    this.isPaused = true;
    logger.warn('Scheduler paused', { minutes });

    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => this.resume(), minutes * 60_000);
  }

  resume(): void {
    this.isPaused = false;
    this.consecutiveBlocks = 0;
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    logger.info('Scheduler resumed');
  }

  getStatus(): SchedulerStatus {
    const elapsed = Date.now() - this.lastCheckTime;
    const nextCheckIn = Math.max(0, Math.floor((this.checkIntervalMs - elapsed) / 1000));
    let queueLength = 0;
    try {
      queueLength = this.getDueTargets().length;
    } catch { /* ignore */ }

    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      isBlackout: this.isBlackoutPeriod(),
      consecutiveBlocks: this.consecutiveBlocks,
      currentTarget: this.currentTarget,
      nextCheckIn,
      queueLength,
    };
  }
}

export function createScheduler(db: Database.Database): SchedulerService {
  schedulerInstance = new SchedulerService(db);
  return schedulerInstance;
}

export function getScheduler(): SchedulerService | null {
  return schedulerInstance;
}
