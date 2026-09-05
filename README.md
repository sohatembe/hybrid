# AX-OpsActivity-Automation

Playwright + TypeScript UI automation framework for the AX Ops Activity stats
dashboard, built on the Page Object Model, with an executive-ready HTML
dashboard emailed automatically after every run.

## Folder structure

```
AX-OpsActivity-Automation/
├── lib/
│   ├── General.ts               # reusable, page-agnostic methods (throbber waits, drill-down, sorting…)
│   └── Global.ts                 # env-driven config, test data, shared selectors
├── pages/                        # Page Object Model classes
│   ├── BasePage.ts
│   ├── LoginPage.ts               # Microsoft SSO + MFA + Switch to Beta
│   └── StatsPage.ts               # Traffic Source Stats + all drill-down views
├── tests/
│   ├── auth.setup.ts              # logs in once, persists storageState
│   ├── traffic-source-stats.spec.ts   # Activity 1
│   ├── BrandFilter.spec.ts            # Activity 2
│   └── BrandOnBrandPerformance.spec.ts # Activity 3
├── utils/
│   ├── executive-summary-reporter.ts  # custom Playwright reporter → HTML dashboard
│   └── emailSender.ts                 # emails the dashboard via Nodemailer
├── scripts/
│   └── run-tests-and-notify.js        # runs tests, then always emails the summary
├── playwright-report/             # generated: Playwright HTML report + executive-summary.html
├── allure-results/ · allure-report/   # generated: Allure raw results + generated report
├── test-results/                  # generated: traces, videos, screenshots, results.json
├── playwright/.auth/user.json     # generated: persisted login session
├── .env.example
├── playwright.config.ts
├── package.json
└── tsconfig.json
```

## 1. Install

```bash
cd AX-OpsActivity-Automation
npm install
npx playwright install --with-deps
```

## 2. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

- `BASE_URL` / `STATS_URL` / `LOGIN_URL` — application under test.
- `LOGIN_EMAIL` / `LOGIN_PASSWORD` — the Microsoft SSO account used by `tests/auth.setup.ts`. MFA push/number-matching cannot be automated — the setup test pauses and waits (up to 2 minutes) for a human to approve it on their device the first time you log in.
- `DEFAULT_BRAND`, `DEFAULT_ACCOUNT_MANAGER`, etc. — shared test data.
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` — mailbox used to send the report.
- `REPORT_TO_EMAIL` — recipient(s), comma-separated (e.g. your boss's address). Replace the placeholder before running for real.

**Never commit `.env`.** It's already git-ignored.

## 3. Run the tests

```bash
npm test                 # headless, all projects (setup → chromium → firefox)
npm run test:chromium    # headless, Chromium only
npm run test:headed      # headed browser window
npm run test:ui          # Playwright's interactive UI mode
npm run test:demo        # headed + a visible pause between each step (DEMO_DELAY)
```

The `setup` project (`auth.setup.ts`) always runs first and is a dependency
of every other project, so a fresh, authenticated `storageState` is in place
before any spec runs — no test logs in individually.

## 4. View reports

```bash
npm run report:html              # opens git remote add origin https://github.com/sohatembe/hybrid.gitPlaywright's interactive HTML report
npm run report:allure:generate   # builds the Allure report from allure-results/
npm run report:allure:open       # opens it
```

The executive dashboard is written automatically to
`playwright-report/executive-summary.html` on every run (no extra command
needed) — open it directly in a browser to preview exactly what gets emailed.

## 5. Send the executive email report

To run the suite and automatically email the dashboard to leadership
afterward — whether the run passed or failed:

```bash
npm run test:notify
```

This runs `playwright test`, then always runs `utils/emailSender.ts`
afterward (a failed run is exactly when your boss most wants the email), and
finally exits with the test run's original pass/fail status code so CI still
reports correctly.

To send the email for a report that already exists (e.g. re-send, or send
from a CI artifact) without re-running tests:

```bash
npm run email:send
```

### What the email looks like

The executive dashboard is rendered **directly in the email body** (not just
attached), so a non-technical manager sees the numbers the instant they open
the message: total / passed / failed / skipped counts, overall pass rate, run
duration, a color-coded pass/fail bar, and a per-test breakdown table with
status badges and the first line of any failure's error message. When
`ATTACH_FULL_REPORT=true` (the default), the full interactive Playwright and
Allure reports are also zipped and attached for anyone who wants to dig into
traces and screenshots.

### CI / scheduled runs

Call `npm run test:notify` as your CI job's test step instead of `npm test`
to get the email automatically on every scheduled or pipeline run — e.g. a
nightly regression job that emails leadership every morning.

## Design notes

- **Page Object Model** — `pages/LoginPage.ts` and `pages/StatsPage.ts`
  encapsulate every locator and page interaction; specs only orchestrate
  business steps and assertions.
- **No hardcoded waits** — every wait is condition-based (`waitFor`,
  `expect(...).toBeVisible()`, `waitForResponse`, `waitForURL`). The one
  opt-in exception is the `DEMO_DELAY` pause, which is `0` (a no-op) unless
  explicitly set for a headed demo run.
- **Existing test logic preserved** — the three Activity specs keep their
  original selectors, retry-on-flyout-collapse logic, and assertions;
  only the structure changed (POM + shared `lib/General.ts` helpers instead
  of duplicated inline code).
- **Fully typed** — `strict: true` in `tsconfig.json`; run `npm run typecheck`
  to verify.
