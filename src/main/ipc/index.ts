import type Database from 'better-sqlite3';
import { registerShopHandlers } from './shopHandlers.js';
import { registerKeywordHandlers } from './keywordHandlers.js';
import { registerCrawlHandlers } from './crawlHandlers.js';
import { registerSnapshotHandlers } from './snapshotHandlers.js';
import { registerAlertHandlers } from './alertHandlers.js';
import { registerAnalyticsHandlers } from './analyticsHandlers.js';
import { registerHtmlCacheHandlers } from './htmlCacheHandlers.js';
import { registerExpansionHandlers } from './expansionHandlers.js';
import { registerAIHandlers } from './aiHandlers.js';
import { registerProxyHandlers } from './proxyHandlers.js';
import { registerProfileHandlers } from './profileHandlers.js';
import { registerSettingsHandlers } from './settingsHandlers.js';

export function registerAllHandlers(db: Database.Database): void {
  const handlerGroups = [
    { name: 'shop', register: registerShopHandlers },
    { name: 'keyword', register: registerKeywordHandlers },
    { name: 'crawl', register: registerCrawlHandlers },
    { name: 'snapshot', register: registerSnapshotHandlers },
    { name: 'alert', register: registerAlertHandlers },
    { name: 'analytics', register: registerAnalyticsHandlers },
    { name: 'htmlCache', register: registerHtmlCacheHandlers },
    { name: 'expansion', register: registerExpansionHandlers },
    { name: 'ai', register: registerAIHandlers },
    { name: 'proxy', register: registerProxyHandlers },
    { name: 'profile', register: registerProfileHandlers },
    { name: 'settings', register: registerSettingsHandlers },
  ];

  for (const group of handlerGroups) {
    group.register(db);
  }

  console.log(`[IPC] Registered ${handlerGroups.length} handler groups`);
}
