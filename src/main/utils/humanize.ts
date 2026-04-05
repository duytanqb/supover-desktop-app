/**
 * Humanize utilities — simulate human-like browsing behavior.
 * Page parameter uses `any` type to avoid Playwright import issues.
 * Actual type: import('playwright-core').Page
 */

/**
 * Returns a random number between min and max (inclusive).
 */
export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for a random duration between minMs and maxMs.
 */
export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = randomBetween(minMs, maxMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scroll the page down 3-5 steps with random intervals between scrolls.
 * Simulates a human scrolling to trigger lazy-loaded content.
 * @param page - Playwright Page instance (typed as any)
 */
export async function scrollPage(page: any): Promise<void> {
  const steps = randomBetween(3, 5);

  for (let i = 0; i < steps; i++) {
    const scrollAmount = randomBetween(300, 700);
    await page.evaluate((amount: number) => {
      window.scrollBy(0, amount);
    }, scrollAmount);
    await randomDelay(500, 1500);
  }
}

/**
 * Move the mouse to a random position within the viewport.
 * @param page - Playwright Page instance (typed as any)
 */
export async function randomMouseMove(page: any): Promise<void> {
  const viewport = page.viewportSize() || { width: 1920, height: 1080 };
  const x = randomBetween(100, viewport.width - 100);
  const y = randomBetween(100, viewport.height - 100);
  await page.mouse.move(x, y, { steps: randomBetween(5, 15) });
}
