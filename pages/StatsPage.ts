/**
 * StatsPage.ts
 * ---------------------------------------------------------------------------
 * Page Object for the Traffic Source Stats screen (base_stats_new.html) and
 * every drill-down view it opens (Sources / Brands / Daily / Country — each
 * opens in its own new browser tab, so methods here consistently return the
 * `Page` they should be interacted with next). Selectors and waits are
 * ported 1:1 from the original Activity 1-3 scripts; only the structure is
 * new (POM instead of flat spec-file code).
 * ---------------------------------------------------------------------------
 */
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import {
  applyFilters as applyFiltersAction,
  clickFooterTab,
  expectTotalRowVisible,
  locateResultsTbody,
  openDrillDownInNewTab,
  pause,
  revealDrillDownIcon,
  selectFromSearchDropdown,
  sortByNetRevenue,
  waitForThrobberHidden,
} from '../lib/General';
import { DRILL_DOWN_TYPES, DrillDownType, SELECTORS, STATS_TABS, URLS } from '../lib/Global';

export class StatsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------

  /** Lands directly on Traffic Source Stats (the 'setup' project already established the session). */
  async goto(): Promise<void> {
    await this.page.goto(URLS.stats);
    await expect(this.page.getByText('Traffic Source Stats')).toBeVisible({ timeout: 15_000 });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByText('Traffic Source Stats')).toBeVisible({ timeout: 15_000 });
  }

  // ---------------------------------------------------------------------
  // Calendar filter
  // ---------------------------------------------------------------------

  async openCalendar(): Promise<void> {
    await pause(this.page, 'Clicking calendar icon...');
    await this.page.locator(SELECTORS.calendarIcon).click();
    await pause(this.page, 'Clicked on calendar icon.');
  }

  /** Selects one of the calendar's quick-range links, e.g. "This Month - Aug,". */
  async selectQuickRange(linkNameOrPattern: string | RegExp): Promise<void> {
    await this.page.getByRole('link', { name: linkNameOrPattern }).click();
  }

  async applyCalendar(): Promise<void> {
    await this.page.locator(SELECTORS.calendarApplyButton).click();
    await pause(this.page, 'Clicked on Apply button to apply the date range.');
  }

  // ---------------------------------------------------------------------
  // Account Manager filter
  // ---------------------------------------------------------------------

  async selectAccountManager(name: string): Promise<void> {
    await pause(this.page, 'Opening Account Manager filter...');
    const accountManagerLabel = this.page.getByText('Account Manager', { exact: true });
    await accountManagerLabel.click();
    await pause(this.page, 'Account Manager filter opened. Waiting for search field to appear...');

    const search = this.page.locator(SELECTORS.accountManagerSearchInput);

    // The filter widget can still be finishing initialization right after
    // landing on this page via a click-through — retry the open once.
    let searchVisible = await expect(search)
      .toBeVisible({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!searchVisible) {
      await accountManagerLabel.click();
      await pause(this.page, 'Re-clicked Account Manager after the panel did not open.');
      await expect(search).toBeVisible({ timeout: 15_000 });
    }

    await selectFromSearchDropdown(this.page, search, name);
    await pause(this.page, `Selected "${name}" from the Account Manager dropdown.`);

    await this.page.keyboard.press('Escape');
    await pause(this.page, 'Pressed Escape to close the dropdown overlay.');
    await this.page.locator(SELECTORS.dropdownChecklistOverlay).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  // ---------------------------------------------------------------------
  // Brand filter
  // ---------------------------------------------------------------------

  /** Opens the Brand filter panel, retrying the click if it flickers open/closed. */
  async openBrandFilter(): Promise<Locator> {
    await pause(this.page, 'Opening Brand filter...');
    const brandLabel = this.page.getByText('Brand', { exact: true });
    const brandSearch = this.page.locator(SELECTORS.brandSearchInput);

    await expect(async () => {
      await brandLabel.click();
      await expect(brandSearch).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15_000 });

    await pause(this.page, 'Brand filter opened.');
    return brandSearch;
  }

  /** Searches for and checks a brand's checkbox in the (already open) Brand filter panel. */
  async selectBrand(brandName: string): Promise<void> {
    const brandSearch = await this.openBrandFilter();
    await brandSearch.click();
    await pause(this.page, 'Brand search field clicked.');

    // Real keystrokes — this widget's live-filter is driven by keyup/keydown,
    // which fill() never dispatches.
    await brandSearch.pressSequentially(brandName, { delay: 50 });
    await pause(this.page, `Typed "${brandName}" into brand search field via keystrokes.`);

    const brandOption = this.page.locator(SELECTORS.dropdownChecklistLabel, {
      hasText: new RegExp(`^${brandName}$`, 'i'),
    });
    await expect(brandOption).toBeVisible({ timeout: 10_000 });

    const brandOptionCheckbox = brandOption.locator('..').locator('input[type="checkbox"]');
    await expect(brandOptionCheckbox).toBeVisible({ timeout: 10_000 });
    await brandOptionCheckbox.check({ timeout: 10_000 });
    await expect(brandOptionCheckbox).toBeChecked({ timeout: 5000 });
    await pause(this.page, `Checked "${brandName}" checkbox.`);
  }

  async expectSelectedBrand(brandName: string): Promise<void> {
    await expect(this.page.getByText(new RegExp(`Selected Brands:\\s*${brandName}`, 'i'))).toBeVisible({
      timeout: 15_000,
    });
  }

  // ---------------------------------------------------------------------
  // Shared filter / results actions
  // ---------------------------------------------------------------------

  async applyFilters(): Promise<void> {
    await applyFiltersAction(this.page);
    await pause(this.page, 'Clicked Go — filter(s) applied.');
  }

  async expectResultsLoaded(): Promise<void> {
    await expectTotalRowVisible(this.page);
    await pause(this.page, 'Data records loaded — Total row is visible.');
  }

  resultsTbody(): Locator {
    return locateResultsTbody(this.page);
  }

  async openTab(tabName: string): Promise<void> {
    await clickFooterTab(this.page, tabName);
    await pause(this.page, `Clicked on ${tabName} tab to view data.`);
  }

  async openDailyTab(): Promise<void> {
    await this.openTab(STATS_TABS.daily);
  }

  async openAdvertiserTab(): Promise<void> {
    await this.openTab(STATS_TABS.advertiser);
  }

  async openBrandsTab(): Promise<void> {
    await this.openTab(STATS_TABS.brands);
  }

  /**
   * Hovers the first result row's drill-down arrow and opens the given
   * drill-down type in a new tab, verifying it loaded with data.
   */
  async drillDownFirstRow(drillDownType: DrillDownType, debugScreenshotName: string): Promise<Page> {
    const tbody = this.resultsTbody();
    await expect(tbody).toBeVisible({ timeout: 15_000 });

    const icon = await revealDrillDownIcon(this.page, tbody, drillDownType, debugScreenshotName);
    await pause(this.page, 'Hovered over the first record\'s arrow to reveal the drill-down menu.');

    const newTab = await openDrillDownInNewTab(this.page, icon, drillDownType);
    console.log(`Drill-down (new tab) loaded and verified: ${newTab.url()}`);
    return newTab;
  }

  /**
   * Reads the "Country" drill-down icon's href directly and navigates a new
   * tab to it. Used on the Daily view, where hovering the row doesn't
   * reliably reveal that particular icon.
   */
  async openCountryDrillDownByHref(fromTab: Page): Promise<Page> {
    const countryTabIcon = fromTab.locator(`a.anchor_tab_new[href*="stats_type=${DRILL_DOWN_TYPES.country}"]`);
    await expect(countryTabIcon).toHaveCount(1);

    const href = await countryTabIcon.getAttribute('href');
    if (!href) {
      await fromTab.screenshot({ path: 'debug-daily-country-href-missing.png', fullPage: true });
      throw new Error('Country tab icon has no href attribute — see debug-daily-country-href-missing.png.');
    }

    const countryUrl = new URL(href, fromTab.url()).toString();
    const countryPage = await fromTab.context().newPage();
    await countryPage.goto(countryUrl);
    await pause(countryPage, 'Navigated new tab directly to Country tab URL.');

    await expect(countryPage).toHaveURL(new RegExp(`stats_type=${DRILL_DOWN_TYPES.country}`));
    await waitForThrobberHidden(countryPage);
    await expectTotalRowVisible(countryPage);
    console.log('Country tab (new tab) loaded and verified:', countryPage.url());
    return countryPage;
  }

  /** Sorts the current page's results by Net Revenue (click = Descending on first sort). */
  async sortNetRevenueDescending(onPage: Page = this.page): Promise<void> {
    await sortByNetRevenue(onPage);
    await pause(onPage, 'Clicked Net Revenue column header — sorting Descending.');
  }
}
