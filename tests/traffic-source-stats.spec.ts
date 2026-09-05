import { test, expect } from '@playwright/test';
import { StatsPage } from '../pages/StatsPage';
import { pause } from '../lib/General';
import { DRILL_DOWN_TYPES, TEST_DATA } from '../lib/Global';

// Reuses playwright/.auth/user.json saved by auth.setup.ts (the 'chromium'/
// 'firefox' projects depend on the 'setup' project — see playwright.config.ts).

test.describe('Traffic Source Stats — Daily drill-down', () => {
  let statsPage: StatsPage;

  test.beforeEach(async ({ page }) => {
    statsPage = new StatsPage(page);
    // Land straight on the Beta Traffic Source Stats page; the setup
    // project already established the session + switched to Beta.
    await statsPage.goto();
  });

  test('Filter by date range + Account Manager, drill into Sources', { tag: '@smoke' }, async ({ page }) => {
    // A per-action ceiling means one wrong selector fails in seconds,
    // not after burning the whole test timeout.
    page.setDefaultTimeout(15_000);

    // ---------------- Calendar: date range ----------------
    await statsPage.openCalendar();
    await statsPage.selectQuickRange(/^This Month/);
    await statsPage.applyCalendar();

    // ---------------- Account Manager filter ----------------
    await statsPage.selectAccountManager(TEST_DATA.defaultAccountManager);

    // ---------------- Apply filter ----------------
    await statsPage.applyFilters();
    await statsPage.expectResultsLoaded();

    // ---------------- Click Daily tab from footer table ----------------
    await statsPage.openDailyTab();
    await expect(page.getByRole('row', { name: 'Publisher Metrics Performance' }).first()).toBeVisible();

    const dailyResultsTbody = statsPage.resultsTbody();
    await expect(dailyResultsTbody).toBeVisible({ timeout: 15_000 });
    console.log('Daily Results table tbody located — ready to drill down.');

    // ---------------- Drill down first Daily record → Sources ----------------
    const sourcesTab = await statsPage.drillDownFirstRow(
      DRILL_DOWN_TYPES.sources,
      'debug-daily-sources-icon-missing'
    );
    await pause(sourcesTab, 'Clicked Sources drill-down icon — new tab opened.');

    // ---------------- On Sources page — apply Descending order for Net Revenue ----------------
    const sourcesNetRevenueHeaderLink = sourcesTab.getByRole('link', { name: 'Net Revenue', exact: true });
    await expect(sourcesNetRevenueHeaderLink).toBeVisible();
    console.log('sourcesNetRevenueHeaderLink Visible');

    await statsPage.sortNetRevenueDescending(sourcesTab);
    console.log('Sources: applied Descending sort on Net Revenue.');
  });
});
