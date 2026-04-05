/**
 * Profile Service — manages Playwright browser profiles.
 * Each profile has a unique directory for persistent context (cookies, storage, fingerprint).
 * Profiles are rotated and burned when blocked.
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { app } from 'electron';
import { join } from 'path';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { logger } from '../utils/logger.js';

export interface BrowserProfile {
  id: string;
  profile_path: string;
  proxy_id: string | null;
  status: string;
  total_requests: number;
  last_used_at: string | null;
  burned_at: string | null;
  burn_reason: string | null;
  created_at: string;
}

/**
 * Create a new browser profile.
 * Generates a UUID, creates a directory, and inserts a record into browser_profiles.
 */
export function createProfile(
  db: Database.Database,
  proxyId?: string
): BrowserProfile {
  const id = uuidv4();
  const profilesDir = join(app.getPath('userData'), 'profiles');
  const profilePath = join(profilesDir, id);

  // Create profile directory
  if (!existsSync(profilesDir)) {
    mkdirSync(profilesDir, { recursive: true });
  }
  mkdirSync(profilePath, { recursive: true });

  const stmt = db.prepare(`
    INSERT INTO browser_profiles (id, profile_path, proxy_id, status, total_requests, created_at)
    VALUES (?, ?, ?, 'active', 0, datetime('now'))
  `);
  stmt.run(id, profilePath, proxyId ?? null);

  logger.info('Created new browser profile', { profileId: id, proxyId });

  return {
    id,
    profile_path: profilePath,
    proxy_id: proxyId ?? null,
    status: 'active',
    total_requests: 0,
    last_used_at: null,
    burned_at: null,
    burn_reason: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Get the active profile with the lowest total_requests (least used).
 * Returns null if no active profiles exist.
 */
export function getAvailableProfile(
  db: Database.Database
): BrowserProfile | null {
  const row = db.prepare(`
    SELECT * FROM browser_profiles
    WHERE status = 'active'
    ORDER BY total_requests ASC, last_used_at ASC
    LIMIT 1
  `).get() as BrowserProfile | undefined;

  if (!row) {
    logger.warn('No available browser profiles found');
    return null;
  }

  return row;
}

/**
 * Mark a profile as burned (detected/blocked by Etsy).
 * Burned profiles should not be reused — create a new one instead.
 */
export function burnProfile(
  db: Database.Database,
  profileId: string,
  reason: string
): void {
  db.prepare(`
    UPDATE browser_profiles
    SET status = 'burned',
        burned_at = datetime('now'),
        burn_reason = ?
    WHERE id = ?
  `).run(reason, profileId);

  logger.warn('Browser profile burned', { profileId, reason });
}

/**
 * Increment the request count and update last_used_at for a profile.
 * Called after each successful page navigation.
 */
export function incrementRequests(
  db: Database.Database,
  profileId: string
): void {
  db.prepare(`
    UPDATE browser_profiles
    SET total_requests = total_requests + 1,
        last_used_at = datetime('now')
    WHERE id = ?
  `).run(profileId);
}

/**
 * Delete burned profiles older than 30 days and remove their directories.
 * Returns the number of profiles cleaned up.
 */
export function cleanupProfiles(db: Database.Database): number {
  const oldProfiles = db.prepare(`
    SELECT id, profile_path FROM browser_profiles
    WHERE status = 'burned'
      AND burned_at < datetime('now', '-30 days')
  `).all() as Array<{ id: string; profile_path: string }>;

  if (oldProfiles.length === 0) {
    return 0;
  }

  const deleteStmt = db.prepare('DELETE FROM browser_profiles WHERE id = ?');

  const cleanup = db.transaction(() => {
    for (const profile of oldProfiles) {
      // Remove directory from disk
      try {
        if (existsSync(profile.profile_path)) {
          rmSync(profile.profile_path, { recursive: true, force: true });
        }
      } catch (err) {
        logger.error('Failed to remove profile directory', {
          profileId: profile.id,
          path: profile.profile_path,
          error: (err as Error).message,
        });
      }

      // Delete DB record
      deleteStmt.run(profile.id);
    }
  });

  cleanup();

  logger.info('Cleaned up burned profiles', { count: oldProfiles.length });
  return oldProfiles.length;
}
