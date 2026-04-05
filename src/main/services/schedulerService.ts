import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

/**
 * Scheduler Service — auto-queue crawl jobs based on interval, handle block detection
 */

export interface SchedulerStatus {
  isRunning: boolean;
  isPaused: boolean;
  consecutiveBlocks: number;
}

interface DueTarget {
  type: 'shop_index' | 'search_index';
  targetId: number;
  name: string;
  priority: string;
}

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isPaused = false;
  private consecutiveBlocks = 0;
  private pauseTimer: NodeJS.Timeout | null = null;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ---------------------------------------------------------------------------
  // Start / Stop
  // ---------------------------------------------------------------------------

  start(): void {
    if (this.timer) return;

    this.isRunning = true;
    this.timer = setInterval(() => {
      this.checkDueJobs().catch(err => {
        logger.error('Scheduler checkDueJobs error', { error: (err as Error).message });
      });
    }, 60_000);

    logger.info('Scheduler started');

    // Run immediately on start
    this.checkDueJobs().catch(err => {
      logger.error('Scheduler initial checkDueJobs error', { error: (err as Error).message });
    });
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
    logger.info('Scheduler stopped');
  }

  // ---------------------------------------------------------------------------
  // Check due jobs
  // ---------------------------------------------------------------------------

  async checkDueJobs(): Promise<void> {
    if (this.isPaused) return;

    const dueTargets = this.getDueTargets();

    if (dueTargets.length === 0) return;

    logger.info('Scheduler found due targets', { count: dueTargets.length });

    for (const target of dueTargets) {
      if (this.isPaused) break;
      await this.processTarget(target);
    }
  }

  // ---------------------------------------------------------------------------
  // Get shops and keywords that need crawling
  // ---------------------------------------------------------------------------

  private getDueTargets(): DueTarget[] {
    const targets: DueTarget[] = [];

    // Shops due for crawl
    const dueShops = this.db.prepare(`
      SELECT s.id, s.shop_name, s.priority, s.crawl_interval_minutes
      FROM shops s
      WHERE s.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM crawl_jobs cj
          WHERE cj.job_type = 'shop_index'
            AND cj.target_id = s.id
            AND cj.status = 'completed'
            AND cj.completed_at > datetime('now', '-' || s.crawl_interval_minutes || ' minutes')
        )
      ORDER BY
        CASE s.priority WHEN 'high' THEN 3 WHEN 'normal' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
        s.updated_at ASC
    `).all() as Array<{ id: number; shop_name: string; priority: string }>;

    for (const shop of dueShops) {
      targets.push({
        type: 'shop_index',
        targetId: shop.id,
        name: shop.shop_name,
        priority: shop.priority,
      });
    }

    // Search keywords due for crawl
    const dueKeywords = this.db.prepare(`
      SELECT sk.id, sk.keyword, 'normal' as priority, sk.crawl_interval_minutes
      FROM search_keywords sk
      WHERE sk.status = 'active'
        AND sk.is_saturated = 0
        AND NOT EXISTS (
          SELECT 1 FROM crawl_jobs cj
          WHERE cj.job_type = 'search_index'
            AND cj.target_id = sk.id
            AND cj.status = 'completed'
            AND cj.completed_at > datetime('now', '-' || sk.crawl_interval_minutes || ' minutes')
        )
      ORDER BY sk.depth ASC, sk.created_at ASC
    `).all() as Array<{ id: number; keyword: string; priority: string }>;

    for (const kw of dueKeywords) {
      targets.push({
        type: 'search_index',
        targetId: kw.id,
        name: kw.keyword,
        priority: kw.priority,
      });
    }

    return targets;
  }

  // ---------------------------------------------------------------------------
  // Process a single target
  // ---------------------------------------------------------------------------

  private async processTarget(target: DueTarget): Promise<void> {
    if (this.isPaused) return;

    logger.info('Scheduler processing target', { type: target.type, targetId: target.targetId, name: target.name });

    try {
      // Create a crawl job record
      const result = this.db.prepare(`
        INSERT INTO crawl_jobs (job_type, target_id, status, started_at)
        VALUES (?, ?, 'pending', datetime('now'))
      `).run(target.type, target.targetId);

      const jobId = result.lastInsertRowid as number;

      // NOTE: The actual crawl execution is delegated to crawlService.
      // This scheduler only creates the job record and tracks block state.
      // The crawlService should be called externally to process pending jobs.
      // Mark job as "pending" so crawlService can pick it up.

      logger.info('Scheduler created crawl job', { jobId, type: target.type, targetId: target.targetId });

      // Reset consecutive blocks on success (job creation)
      this.consecutiveBlocks = 0;

    } catch (error) {
      const errMsg = (error as Error).message;

      // Check if this is a block error
      if (errMsg.includes('blocked') || errMsg.includes('BlockedError')) {
        this.consecutiveBlocks++;
        logger.warn('Scheduler detected block', {
          consecutiveBlocks: this.consecutiveBlocks,
          target: target.name,
        });

        // Get pause threshold from settings
        const pauseThresholdRow = this.db.prepare(
          "SELECT value FROM settings WHERE key = 'pause_on_consecutive_blocks'",
        ).get() as { value: string } | undefined;
        const pauseThreshold = parseInt(pauseThresholdRow?.value ?? '3', 10);

        if (this.consecutiveBlocks >= pauseThreshold) {
          const pauseMinutesRow = this.db.prepare(
            "SELECT value FROM settings WHERE key = 'pause_duration_minutes'",
          ).get() as { value: string } | undefined;
          const pauseMinutes = parseInt(pauseMinutesRow?.value ?? '30', 10);

          this.pause(pauseMinutes);

          // Create an alert for the auto-pause
          try {
            this.db.prepare(`
              INSERT INTO alerts (alert_type, severity, old_value, new_value)
              VALUES ('scheduler_auto_pause', 'important', ?, ?)
            `).run(
              String(this.consecutiveBlocks),
              `Paused for ${pauseMinutes} minutes`,
            );
          } catch {
            // Non-critical
          }
        }
      } else {
        logger.error('Scheduler processTarget failed', {
          target: target.name,
          error: errMsg,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pause / Resume
  // ---------------------------------------------------------------------------

  pause(minutes: number): void {
    this.isPaused = true;
    logger.warn('Scheduler paused', { minutes, consecutiveBlocks: this.consecutiveBlocks });

    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => {
      this.resume();
    }, minutes * 60_000);
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

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  getStatus(): SchedulerStatus {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      consecutiveBlocks: this.consecutiveBlocks,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createScheduler(db: Database.Database): SchedulerService {
  return new SchedulerService(db);
}
