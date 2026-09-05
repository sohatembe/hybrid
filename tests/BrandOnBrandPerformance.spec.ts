import { test, expect } from '@playwright/test';
import { StatsPage } from '../pages/StatsPage';
import { LoginPage } from '../pages/LoginPage';
import { pause, waitForThrobberHidden } from '../lib/General';
import { DRILL_DOWN_TYPES, TEST_DATA, URLS } from '../lib/Global';

// Reuses playwright/.auth/user.json saved by auth.setup.ts (Step 1 — login
// with MFA — is validated there; see playwright.config.ts project
// dependency). This test starts from the old admin dashboard so Steps 2-3
// (Switch to Beta, Stats → Super Stats New) are exercised explicitly rather
// than assumed.

test.describe('Brand Stats — Sort Net Revenue and Daily drill-down', () => {
  test('Filter by Account Manager, sort Brand Net Revenue, drill into Daily',{ tag: '@integration' }, async ({ page }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);

    const statsPage = new StatsPage(page);
    const loginPage = new LoginPage(page);

    // ---------------- Step 1: Login ----------------
    // Handled by the 'setup' project (auth.setup.ts) — it asserts a
    // successful Microsoft login (with MFA) before saving storageState.
    // Reusing that state here is what lets this test start authenticated;
    // if this test's project doesn't depend on 'setup' in
    // playwright.config.ts, this whole flow will fail at the next step.

    // ---------------- Step 2: Switch to Beta Admin Interface ----------------
    await page.goto(URLS.oldDashboard);
    await loginPage.switchToBetaInterface();
    await pause(page, 'Switched to Beta Admin Interface.');

    // Step 3 already asserted inside switchToBetaInterface() — "Switch to
    // Beta Admin Interface" navigates directly to base_stats_new.html
    // (Super Stats New / Traffic Source Stats).
    await pause(page, 'Landed on Super Stats New (Traffic Source Stats).');

    // ---------------- Steps 4-5: Account Manager filter ----------------
    await statsPage.selectAccountManager(TEST_DATA.defaultAccountManager);

    // ---------------- Step 6: Go ----------------
    await statsPage.applyFilters();
    await statsPage.expectResultsLoaded();

    // ---------------- Step 7: Brands tab ----------------
    await statsPage.openBrandsTab();

    const resultsTbody = statsPage.resultsTbody();
    await expect(resultsTbody).toBeVisible({ timeout: 15_000 });
    console.log('Results table tbody located — ready to sort and drill down.');

    // ---------------- Step 8: Net Revenue — sort Ascending ----------------
    // Before the column has ever been sorted, the header only shows a plain
    // "Net Revenue" link (defaults to oo=DESC) — the explicit "Sort Ascending" /
    // "Sort Descending" toggle icons only appear once the column has already
    // been sorted once. So: sort once first, then use the Ascending toggle.
    const netRevenueHeaderLink = page.getByRole('link', { name: 'Net Revenue', exact: true });
    await expect(netRevenueHeaderLink).toBeVisible({ timeout: 10_000 });

    await Promise.all([
      page
        .waitForResponse((res) => res.url().includes('of=incoming_net_revenue') && res.ok(), {
          timeout: 30_000,
        })
        .catch(() => null),
      netRevenueHeaderLink.click({ timeout: 30_000 }),
    ]);
    await waitForThrobberHidden(page);
    await pause(page, 'Sorted by Net Revenue (initial click).');
    await expect(resultsTbody).toBeVisible({ timeout: 15_000 });

    // The explicit Ascending toggle now exists in the re-rendered header.
    const netRevenueSortAscending = page.locator('a[img_alias="incoming_net_revenue"][title="Sort Ascending"]:visible');
    await expect(netRevenueSortAscending).toBeVisible({ timeout: 10_000 });
    await Promise.all([
      page
        .waitForResponse(
          (res) => res.url().includes('of=incoming_net_revenue') && res.url().includes('oo=ASC') && res.ok(),
          { timeout: 30_000 }
        )
        .catch(() => null),
      netRevenueSortAscending.click({ timeout: 30_000 }),
    ]);
    await waitForThrobberHidden(page);
    await pause(page, 'Applied Ascending order on Net Revenue.');
    await expect(resultsTbody).toBeVisible({ timeout: 15_000 });

    // ---------------- Fetch first Brand + Net Revenue after Ascending sort ----------------
    // Computed entirely in the browser via cellIndex — this avoids the
    // ambiguity of chaining Playwright locators for the header row, since
    // the outer wrapper <table> also technically "has" a Net Revenue link
    // descendant.
    const { firstBrandName, firstNetRevenue } = await page.evaluate(() => {
      const netRevenueLink = Array.from(document.querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === 'Net Revenue'
      );
      const headerCell = netRevenueLink?.closest('th, td') as HTMLTableCellElement | undefined;
      const table = netRevenueLink?.closest('table');
      if (!headerCell || !table) return { firstBrandName: null, firstNetRevenue: null };

      const netRevenueIndex = headerCell.cellIndex;

      const dataRows = Array.from(table.querySelectorAll('tbody tr'));
      const firstDataRow = dataRows.find((tr) => tr.querySelector('img'));
      if (!firstDataRow) return { firstBrandName: null, firstNetRevenue: null };

      const cells = firstDataRow.querySelectorAll('td');
      return {
        firstBrandName: cells[1]?.textContent?.trim() ?? null,
        firstNetRevenue: cells[netRevenueIndex]?.textContent?.trim() ?? null,
      };
    });

    console.log(`First Brand after Ascending sort — Brand: ${firstBrandName}, Net Revenue: ${firstNetRevenue}`);

    // ---------------- Step 10: Drill down first record → Daily from brand tab ----------------
    const dailyTab = await statsPage.drillDownFirstRow(DRILL_DOWN_TYPES.daily, 'debug-daily-icon-missing');
    await pause(page, 'Clicked Daily drill-down icon — new tab opened.');

    await expect(dailyTab.getByRole('row', { name: 'Publisher Metrics Performance' }).first()).toBeVisible();
    await pause(dailyTab, 'Daily drill-down data displayed successfully for the first record.');
    console.log('Daily drill-down data displayed successfully for the first record:', dailyTab.url());

    await dailyTab.waitForTimeout(1000);
    await dailyTab.mouse.wheel(0, 650);
    await pause(dailyTab, 'Scrolled down to view the Daily results.');
    await dailyTab.waitForTimeout(1000);
  });
});
