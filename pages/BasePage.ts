/**
 * BasePage.ts
 * ---------------------------------------------------------------------------
 * Common ancestor for every Page Object in the framework. Keeps a page
 * reference and exposes the handful of behaviors every page shares.
 * ---------------------------------------------------------------------------
 */
import { Page, expect } from '@playwright/test';
import { waitForThrobberHidden } from '../lib/General';
import { TIMEOUTS } from '../lib/Global';

export class BasePage {
  constructor(protected readonly page: Page) {}

  /** Waits for the app's global AJAX throbber to hide, if present. */
  async waitForThrobberHidden(timeout = TIMEOUTS.throbberHidden): Promise<void> {
    await waitForThrobberHidden(this.page, timeout);
  }

  /** Convenience wrapper so specs don't need to import `Page` for simple assertions. */
  async expectTitleContains(text: string | RegExp): Promise<void> {
    await expect(this.page).toHaveURL(text instanceof RegExp ? text : new RegExp(text));
  }

  get currentUrl(): string {
    return this.page.url();
  }
}
