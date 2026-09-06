import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
 
dotenv.config({ path: path.resolve(__dirname, '.env') });
 
export default defineConfig({
 
  testDir: './tests',
 
  // This flow (calendar + two filters + Go + Daily + row expand + Sources
  // drill-down + Net Revenue + Monthly, each a real round trip to a live
  // app) realistically runs 40-90s depending on server response time.
  // Playwright's default is 30000ms, which this flow can exceed even with
  // no bugs at all — size it to the actual work instead of hoping it fits.
  timeout: 90_000,
 
  fullyParallel: true,
 
  forbidOnly: !!process.env.CI,
 
  retries: process.env.CI ? 1 : 0,
 
  workers: process.env.CI ? 1 : 1,
 
  reporter: [
    ['html'],
    ['allure-playwright'],
  ],
 
  use: {
    headless: !!process.env.CI,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
 
    // These belong here, not at the top level of defineConfig — Playwright
    // does not read actionTimeout/navigationTimeout from the config root.
    // This is what actually bounds every .click()/.fill()/etc. that doesn't
    // pass its own { timeout }, so a wrong selector fails in ~15s instead of
    // silently consuming the whole test's 300s budget.
    actionTimeout: 15000,
    navigationTimeout: 30000,
 
    launchOptions: {
      // 500ms of artificial delay per action adds up fast across a long
      // flow (15+ actions here = 7.5s+ for nothing) and eats into the test
      // timeout budget for no test-correctness benefit. Keep it available
      // for manual debugging only: SLOWMO=500 npx playwright test --headed
      //slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : 0,
      slowMo: 1000,
    },
  },
 
  // NOTE: no top-level testMatch here on purpose — each project below sets
  // its own, and a project's testMatch REPLACES (not merges with) a
  // root-level one for that project. Setting both is what caused the
  // "No tests found" bug: the project's narrower pattern was silently
  // winning over the broader root-level one.
 
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
 
    // Fixed cross-file execution order: Activity 1 -> Activity 3 -> Activity 2.
    // Each project matches exactly one spec file and depends on the previous
    // one, so a single `npx playwright test` always runs them in this order
    // (and a project with no passing dependency is skipped, so an earlier
    // Activity failing stops the later ones from running).
    {
      name: 'activity1',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
      testMatch: /traffic-source-stats\.spec\.ts$/,
    },
    {
      name: 'activity3',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['activity1'],
      testMatch: /BrandOnBrandPerformance\.spec\.ts$/,
    },
    {
      name: 'activity2',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['activity3'],
      testMatch: /BrandFilter\.spec\.ts$/,
    },
  ],
});
 
 