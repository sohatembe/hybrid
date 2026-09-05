/**
 * General.ts
 * ---------------------------------------------------------------------------
 * Reusable, page-agnostic methods shared across the whole application:
 * throbber waits, drill-down flyout handling, results-table location, and
 * the demo pause helper. These are pure Playwright helpers (no test data) —
 * page objects in pages/*.ts compose them into named, page-specific actions.
 *
 * Every wait here is condition-based (visibility/hidden/URL/response) —
 * no hardcoded `waitForTimeout` sleeps gate the actual flow, per Playwright
 * best practice. The one exception (`pause`) is opt-in and off (0ms) unless
 * DEMO_DELAY is explicitly set, purely for headed human-watched demo runs.
 * ---------------------------------------------------------------------------
 */
import { Page, Locator, expect } from '@playwright/test';
import { DEMO_DELAY, SELECTORS, TIMEOUTS, DrillDownType } from './Global';

/** Logs a step label and, only when DEMO_DELAY is set, pauses briefly. */
export async function pause(page: Page, label: string): Promise<void> {
  console.log(label);
  if (DEMO_DELAY > 0) {
    await page.waitForTimeout(DEMO_DELAY);
  }
}

/** Waits for the app's global AJAX throbber to disappear, if it ever appeared. */
export async function waitForThrobberHidden(page: Page, timeout = TIMEOUTS.throbberHidden): Promise<void> {
  await page.locator(SELECTORS.pageThrobber).waitFor({ state: 'hidden', timeout }).catch(() => {});
}

/** Asserts the results table has finished loading (its "Total" summary row is visible). */
export async function expectTotalRowVisible(page: Page, timeout = TIMEOUTS.dataLoad): Promise<void> {
  await expect(page.getByRole('cell', { name: 'Total', exact: true }).first()).toBeVisible({ timeout });
}

/**
 * Clicks the filter panel's "Go" link and waits for the resulting data
 * refresh (throbber hide + Total row visible).
 */
export async function applyFilters(page: Page): Promise<void> {
  const goLink = page.locator(SELECTORS.applyFilterGoLink).getByRole('link', { name: /^go$/i });
  await goLink.scrollIntoViewIfNeeded();
  await goLink.click();
  await waitForThrobberHidden(page);
  await expectTotalRowVisible(page);
}

/**
 * Locates the <tbody> of the one results table that actually contains the
 * "Net Revenue" column and a "Total" summary cell. Scoping this way avoids
 * unrelated tables (e.g. #one-column-emphasis) and pagination-only tbodies.
 */
export function locateResultsTbody(page: Page): Locator {
  const resultsTable = page.locator('table').filter({
    has: page.getByRole('link', { name: 'Net Revenue', exact: true }),
  });
  return resultsTable
    .locator('tbody')
    .filter({ has: page.getByRole('cell', { name: 'Total', exact: true }) })
    .first();
}

/** Clicks a footer tab (Daily / Advertiser / Brands / …) and waits for its data reload. */
export async function clickFooterTab(page: Page, tabName: string): Promise<void> {
  const tab = page.locator('a[onclick*="loadStatsList"]', { hasText: tabName });
  await expect(tab).toBeVisible();
  await waitForThrobberHidden(page);
  await tab.click();
  await waitForThrobberHidden(page);
}

/**
 * Hovers the first data row's drill-down arrow in the given results tbody
 * and returns the locator for its "open in new tab" icon for the requested
 * drill-down type, retrying the hover once if the flyout collapses before
 * the icon becomes visible (mirrors the original per-spec retry pattern).
 */
export async function revealDrillDownIcon(
  page: Page,
  resultsTbody: Locator,
  drillDownType: DrillDownType,
  debugScreenshotName: string
): Promise<Locator> {
  const firstRowArrow = resultsTbody
    .locator('tr')
    .filter({ has: page.locator('img') })
    .first()
    .locator('img')
    .first();

  await expect(firstRowArrow).toBeVisible();
  await firstRowArrow.hover();

  const icon = page.locator(`${SELECTORS.drillDownFlyout} a.anchor_tab_new[href*="stats_type=${drillDownType}"]`);

  let found = await expect(icon)
    .toBeVisible({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (!found) {
    await firstRowArrow.hover({ force: true, timeout: 10_000 });
    found = await expect(icon)
      .toBeVisible({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  }

  if (!found) {
    await page.screenshot({ path: `${debugScreenshotName}.png`, fullPage: true });
    throw new Error(
      `Drill-down icon for stats_type=${drillDownType} not found — selector likely stale. ` +
        `See ${debugScreenshotName}.png.`
    );
  }

  return icon;
}

/**
 * Clicks a drill-down icon that opens its target in a brand-new browser tab,
 * waits for that tab to load, and verifies it landed on the expected
 * stats_type view with data already rendered.
 */
export async function openDrillDownInNewTab(sourcePage: Page, icon: Locator, drillDownType: DrillDownType): Promise<Page> {
  const [newTab] = await Promise.all([sourcePage.context().waitForEvent('page'), icon.click()]);
  await newTab.waitForLoadState();
  await expect(newTab).toHaveURL(new RegExp(`stats_type=${drillDownType}`));
  await waitForThrobberHidden(newTab);
  await expectTotalRowVisible(newTab);
  return newTab;
}

/** Clicks the "Net Revenue" column header to sort the table (defaults to Descending). */
export async function sortByNetRevenue(page: Page): Promise<void> {
  const header = page.getByRole('link', { name: 'Net Revenue', exact: true });
  await expect(header).toBeVisible();
  await header.click();
  await waitForThrobberHidden(page);
  await expectTotalRowVisible(page);
}

/**
 * Selects a value from one of the app's "dropdownchecklist" search widgets
 * (used by both the Account Manager and Brand filters): types the query via
 * real keystrokes (the widget's live-filter listens for keyup/keydown, so
 * `fill()` alone would not trigger it), then clicks the matching option.
 */
export async function selectFromSearchDropdown(
  page: Page,
  searchInput: Locator,
  optionExactText: string
): Promise<void> {
  await searchInput.click();
  await searchInput.pressSequentially(optionExactText, { delay: 50 });

  const option = page.locator(SELECTORS.dropdownChecklistLabel, {
    hasText: new RegExp(`^${optionExactText}$`, 'i'),
  });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}
