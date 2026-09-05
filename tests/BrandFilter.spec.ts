import { test, expect } from '@playwright/test';
import { StatsPage } from '../pages/StatsPage';
import { pause } from '../lib/General';
import { DRILL_DOWN_TYPES } from '../lib/Global';

// Reuses playwright/.auth/user.json saved by auth.setup.ts (Steps 1-2 —
// Microsoft login with MFA, then Switch to Beta Admin Interface — are
// handled there; see playwright.config.ts project dependency).

const BRAND_NAME = 'quickbooks';

test.describe('Traffic Source Stats — Brand Filter, Advertiser drill-down', () => {
  let statsPage: StatsPage;

  test.beforeEach(async ({ page }) => {
    statsPage = new StatsPage(page);
    // Steps 1-2 (Login with MFA, Switch to Beta Admin Interface) are
    // handled by the 'setup' project. "Switch to Beta Admin Interface"
    // navigates directly to base_stats_new.html (Super Stats New /
    // Traffic Source Stats — Step 3), so land straight there.
    await statsPage.goto();
  });

  test('Filter by Brand, drill Advertiser → Brands → Sources → Daily → Country',{ tag: '@sanity' }, async ({ page }) => {
    // A per-action ceiling means one wrong selector fails in seconds,
    // not after burning the whole test timeout.
    page.setDefaultTimeout(15_000);

    // ---------------- Step 4-5: Brand filter — search & select "quickbooks" ----------------
    await statsPage.selectBrand(BRAND_NAME);

    // ---------------- Apply selected filters ----------------
    await statsPage.applyFilters();
    await statsPage.expectSelectedBrand(BRAND_NAME);

    // ---------------- Step 6: Wait for page to load the data ----------------
    await statsPage.expectResultsLoaded();

    // ---------------- Step 7: Advertiser tab ----------------
    await statsPage.openAdvertiserTab();

    const advertiserResultsTbody = statsPage.resultsTbody();
    await expect(advertiserResultsTbody).toBeVisible({ timeout: 15_000 });
    console.log('Advertiser Results table tbody located — ready to drill down.');

    await page.mouse.wheel(0, 650);
    await pause(page, 'Scrolled down to view the results after applying the filter.');

    // ---------------- Steps 8-9: Drill down first Advertiser record → Brands ----------------
    const brandsTab = await statsPage.drillDownFirstRow(DRILL_DOWN_TYPES.brands, 'debug-advertiser-brands-icon-missing');
    await pause(brandsTab, 'Clicked Brands drill-down icon — new tab opened.');

    const brandsStatsPage = new StatsPage(brandsTab);

    // ---------------- Step 10: On Brand page — drill down with Sources ----------------
    const sourcesTab = await brandsStatsPage.drillDownFirstRow(DRILL_DOWN_TYPES.sources, 'debug-brands-sources-icon-missing');
    await pause(sourcesTab, 'Clicked Sources drill-down icon — new tab opened.');

    const sourcesStatsPage = new StatsPage(sourcesTab);

    // ---------------- Step 11: On Sources page — apply Descending order for Net Revenue ----------------
    await sourcesStatsPage.sortNetRevenueDescending();
    console.log('Sources: applied Descending sort on Net Revenue.');

    // ---------------- Step 12: On Sources page — drill down with Daily ----------------
    const dailyTabPage = await sourcesStatsPage.drillDownFirstRow(DRILL_DOWN_TYPES.daily, 'debug-sources-daily-icon-missing');
    await pause(dailyTabPage, 'Clicked Daily drill-down icon — new tab opened.');

    const dailyStatsPage = new StatsPage(dailyTabPage);

    // ---------------- Step 13: On Daily page — apply Descending order for Net Revenue ----------------
    await dailyStatsPage.sortNetRevenueDescending();
    console.log('Daily: applied Descending sort on Net Revenue.');

    // ---------------- Step 14: On Daily page — open Country tab (opens in a separate tab) ----------------
    // Hovering the label didn't reliably reveal this icon — reading its href
    // directly is safe since it's a plain <a href> whose target is a static
    // query string, not something requiring an actual click to compute.
    const countryPage = await dailyStatsPage.openCountryDrillDownByHref(dailyTabPage);
    void countryPage; // page already asserted/loaded inside openCountryDrillDownByHref
  });
});
