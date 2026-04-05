/**
 * Browser Service — manages Playwright persistent browser contexts.
 * Handles launching with anti-detection settings, proxy config, and block detection.
 */

import { chromium } from 'playwright-core';
import { logger } from '../utils/logger.js';

/**
 * Launch a persistent browser context with anti-detection settings.
 * Uses a profile directory to persist cookies, localStorage, and fingerprint.
 *
 * @param profilePath - Absolute path to the browser profile directory
 * @param proxyUrl - Optional proxy URL (protocol://user:pass@host:port)
 * @returns Playwright BrowserContext (typed as any to avoid import issues in consumers)
 */
export async function launchPersistentContext(
  profilePath: string,
  proxyUrl?: string
): Promise<any> {
  const launchOptions: Record<string, any> = {
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    ignoreDefaultArgs: ['--enable-automation'],
  };

  if (proxyUrl) {
    launchOptions.proxy = { server: proxyUrl };
    logger.info('Launching browser with proxy', { proxy: proxyUrl.replace(/:[^:@]+@/, ':***@') });
  }

  logger.info('Launching persistent browser context', { profilePath });

  const context = await chromium.launchPersistentContext(profilePath, launchOptions);

  return context;
}

/**
 * Safely close a browser context.
 * @param ctx - Playwright BrowserContext instance
 */
export async function closeContext(ctx: any): Promise<void> {
  try {
    if (ctx) {
      await ctx.close();
      logger.info('Browser context closed');
    }
  } catch (error) {
    logger.error('Error closing browser context', { error: (error as Error).message });
  }
}

/**
 * Check if the current page is blocked (captcha, access denied, etc.).
 * Must be called BEFORE saving HTML to avoid caching blocked pages.
 *
 * @param page - Playwright Page instance
 * @returns true if the page appears to be blocked
 */
export async function isBlocked(page: any): Promise<boolean> {
  try {
    const url: string = page.url();
    const title: string = await page.title();
    const bodyText: string = await page.textContent('body').catch(() => '');

    const urlBlocked =
      url.includes('captcha') ||
      url.includes('blocked') ||
      url.includes('sorry') ||
      url.includes('challenge');

    const titleBlocked =
      title.includes('Access Denied') ||
      title.includes('Please verify') ||
      title.includes('Robot') ||
      title.includes('Blocked');

    const bodyBlocked =
      bodyText.includes('unusual traffic') ||
      bodyText.includes('not a robot') ||
      bodyText.includes("we've detected unusual") ||
      bodyText.includes('verify you are a human') ||
      bodyText.includes('automated access');

    const blocked = urlBlocked || titleBlocked || bodyBlocked;

    if (blocked) {
      logger.warn('Page appears to be blocked', {
        url,
        title,
        urlBlocked,
        titleBlocked,
        bodyBlocked,
      });
    }

    return blocked;
  } catch (error) {
    logger.error('Error checking block status', { error: (error as Error).message });
    // If we can't check, assume not blocked to avoid false positives
    return false;
  }
}
