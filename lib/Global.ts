/**
 * Global.ts
 * ---------------------------------------------------------------------------
 * Single source of truth for test data, environment-driven config, and the
 * shared selectors reused across every page/spec in the application. Nothing
 * in here performs actions — see lib/General.ts and pages/*.ts for behavior.
 * ---------------------------------------------------------------------------
 */
import 'dotenv/config';

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}. See .env.example.`);
  }
  return value;
}

/** Application URLs (see .env.example). */
export const URLS = {
  base: env('BASE_URL', 'https://beta-ax.siteplug.com'),
  stats: env('STATS_URL', 'https://beta-ax.siteplug.com/stats/base_stats_new.html'),
  login: env('LOGIN_URL', 'https://beta-ax.siteplug.com/login'),
  oldDashboard: 'https://ax.siteplug.com/system/dashboard.html',
  microsoftLoginHost: 'ax.siteplug.com',
} as const;

/** Login credentials — Microsoft SSO account used by auth.setup.ts. */
export const CREDENTIALS = {
  email: process.env.LOGIN_EMAIL ?? process.env.AX_USERNAME ?? '',
  password: process.env.LOGIN_PASSWORD ?? process.env.AX_PASSWORD ?? '',
} as const;

/** Default/shared test data referenced by more than one spec. */
export const TEST_DATA = {
  defaultBrand: process.env.DEFAULT_BRAND ?? 'Amazon',
  defaultCountry: process.env.DEFAULT_COUNTRY ?? 'India',
  defaultDeviceCategory: process.env.DEFAULT_DEVICE_CATEGORY ?? 'Mobile',
  defaultPlatform: process.env.DEFAULT_PLATFORM ?? 'Android',
  defaultAccountManager: process.env.DEFAULT_ACCOUNT_MANAGER ?? 'Pooja Shah',
} as const;

/** Standard per-action / async-wait timeouts (ms), reused across specs. */
export const TIMEOUTS = {
  action: 15_000,
  panelOpen: 15_000,
  dataLoad: 15_000,
  throbberHidden: 20_000,
  newTab: 15_000,
  network: 30_000,
  mfaFirstCheck: 25_000,
  mfaApproval: 120_000,
} as const;

/**
 * drill-down "stats_type" values used by the flyout's "open in new tab"
 * icons (div#drill_down_div a.anchor_tab_new[href*="stats_type=..."]).
 */
export const DRILL_DOWN_TYPES = {
  sources: 'ts_wise',
  brands: 'brands_wise',
  daily: 'day_wise',
  country: 'cc_wise',
} as const;
export type DrillDownType = (typeof DRILL_DOWN_TYPES)[keyof typeof DRILL_DOWN_TYPES];

/** Footer tab labels on the Traffic Source Stats results table. */
export const STATS_TABS = {
  daily: 'Daily',
  advertiser: 'Advertiser',
  brands: 'Brands',
} as const;

/** Selectors shared by more than one page object. */
export const SELECTORS = {
  pageThrobber: '#page_throbber',
  applyFilterGoLink: '#apply_filter_div',
  drillDownFlyout: '#drill_down_div',
  calendarIcon: "//span[@class='calico']",
  calendarApplyButton: "//input[@class='btnapply']",
  accountManagerSearchInput: '#accmanager-filter-parent input.searchfield',
  brandSearchInput: '#brand_search_txt',
  dropdownChecklistLabel: 'label.ui-dropdownchecklist-text',
  dropdownChecklistOverlay: '.ui-dropdownchecklist-text',
} as const;

/** Opt-in visual pause (ms) between steps, for headed demo runs only. */
export const DEMO_DELAY = process.env.DEMO_DELAY ? Number(process.env.DEMO_DELAY) : 0;

/** Where auth.setup.ts persists the authenticated storageState. */
export const AUTH_FILE = 'playwright/.auth/user.json';
