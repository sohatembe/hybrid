/**
 * executive-summary-reporter.ts
 * ---------------------------------------------------------------------------
 * Custom Playwright reporter that compiles run metrics — total, passed,
 * failed, skipped, flaky, and duration — into a single, standalone,
 * CSS-styled HTML file suitable for direct email delivery to non-technical
 * leadership (see utils/emailSender.ts).
 *
 * Deliberately avoids any charting library or external asset: every visual
 * (the pass-rate bar, status badges) is built from plain HTML tables and
 * inline CSS so it survives being pasted straight into an email body, where
 * most corporate mail clients strip <script> tags and block external
 * stylesheets/images.
 *
 * Also writes a sibling executive-summary.json with the same metrics, for
 * any downstream tooling (Slack bot, dashboard, CI gate, etc.) that wants
 * machine-readable numbers instead of parsing HTML.
 * ---------------------------------------------------------------------------
 */
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';

interface ExecutiveSummaryReporterOptions {
  outputFile?: string;
}

interface TestRow {
  project: string;
  file: string;
  title: string;
  status: TestResult['status'];
  durationMs: number;
  retries: number;
  errorMessage?: string;
}

interface Metrics {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  timedOut: number;
  skipped: number;
  flaky: number;
  passRate: number; // 0-100, based on total - skipped
  rows: TestRow[];
  environment: {
    baseUrl: string;
    ci: boolean;
  };
}

const STATUS_COLORS: Record<string, string> = {
  passed: '#1e7e34',
  failed: '#c82333',
  timedOut: '#c82333',
  skipped: '#6c757d',
  flaky: '#e8a400',
};

const STATUS_LABELS: Record<string, string> = {
  passed: 'Passed',
  failed: 'Failed',
  timedOut: 'Timed Out',
  skipped: 'Skipped',
  flaky: 'Flaky (passed on retry)',
};

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default class ExecutiveSummaryReporter implements Reporter {
  private outputFile: string;
  private rows: TestRow[] = [];
  private startTime = 0;
  private config!: FullConfig;
  private suite!: Suite;

  constructor(options: ExecutiveSummaryReporterOptions = {}) {
    this.outputFile = options.outputFile ?? 'playwright-report/executive-summary.html';
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.suite = suite;
    this.startTime = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name ?? 'default';
    const file = path.basename(test.location.file);
    const status: TestResult['status'] =
      result.status === 'passed' && result.retry > 0 ? 'flaky' : result.status;

    // describe-block title (if any) + the test's own title — robust across
    // Playwright versions, unlike indexing into titlePath().
    const describeTitle = test.parent.title;
    const title = describeTitle ? `${describeTitle} › ${test.title}` : test.title;

    this.rows.push({
      project,
      file,
      title,
      status,
      durationMs: result.duration,
      retries: result.retry,
      errorMessage: result.error?.message?.split('\n')[0],
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const finishedAt = new Date();
    const startedAt = new Date(this.startTime);

    const passed = this.rows.filter((r) => r.status === 'passed').length;
    const flaky = this.rows.filter((r) => r.status === 'flaky').length;
    const failed = this.rows.filter((r) => r.status === 'failed').length;
    const timedOut = this.rows.filter((r) => r.status === 'timedOut').length;
    const skipped = this.rows.filter((r) => r.status === 'skipped').length;
    const total = this.rows.length;
    const consideredForRate = total - skipped || 1;
    const passRate = Math.round(((passed + flaky) / consideredForRate) * 1000) / 10;

    const metrics: Metrics = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      total,
      passed,
      failed: failed + timedOut,
      timedOut,
      skipped,
      flaky,
      passRate,
      rows: this.rows,
      environment: {
        baseUrl: process.env.BASE_URL ?? 'n/a',
        ci: !!process.env.CI,
      },
    };

    const outDir = path.dirname(this.outputFile);
    fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(this.outputFile, renderHtml(metrics, result.status), 'utf-8');
    fs.writeFileSync(path.join(outDir, 'executive-summary.json'), JSON.stringify(metrics, null, 2), 'utf-8');

    console.log(`\nExecutive summary written to: ${this.outputFile}`);
  }
}

function renderHtml(m: Metrics, overallStatus: FullResult['status']): string {
  const overallColor = overallStatus === 'passed' ? STATUS_COLORS.passed : STATUS_COLORS.failed;
  const overallLabel = overallStatus === 'passed' ? 'ALL TESTS PASSED' : 'ATTENTION NEEDED';

  const passSegmentPct = Math.round(((m.passed + m.flaky) / (m.total || 1)) * 100);
  const failSegmentPct = Math.round((m.failed / (m.total || 1)) * 100);
  const skipSegmentPct = Math.max(0, 100 - passSegmentPct - failSegmentPct);

  const rowsHtml = m.rows
    .map((r) => {
      const color = STATUS_COLORS[r.status] ?? '#333';
      const label = STATUS_LABELS[r.status] ?? r.status;
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eef0f2;font-size:13px;color:#333;">${escapeHtml(r.file)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eef0f2;font-size:13px;color:#333;">${escapeHtml(r.title)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eef0f2;text-align:center;">
            <span style="display:inline-block;padding:3px 10px;border-radius:12px;background:${color};color:#ffffff;font-size:11px;font-weight:600;letter-spacing:.3px;">${label}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #eef0f2;font-size:13px;color:#666;text-align:right;">${fmtDuration(r.durationMs)}</td>
        </tr>
        ${
          r.errorMessage
            ? `<tr><td colspan="4" style="padding:0 12px 10px 12px;border-bottom:1px solid #eef0f2;"><span style="font-size:12px;color:#c82333;font-family:Consolas,Menlo,monospace;">${escapeHtml(r.errorMessage)}</span></td></tr>`
            : ''
        }`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AX Ops Activity — Test Execution Summary</title>
<style>
  body { margin:0; padding:0; background:#f4f6f8; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#1c1f24; }
  .wrapper { max-width: 860px; margin: 0 auto; padding: 24px 16px; }
  .card { background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08); margin-bottom:20px; }
  .header { background:#0f1e3c; padding:24px 28px; color:#ffffff; }
  .header h1 { margin:0 0 4px 0; font-size:20px; font-weight:700; }
  .header p { margin:0; font-size:13px; color:#c7d0e0; }
  .status-pill { display:inline-block; margin-top:12px; padding:6px 16px; border-radius:20px; font-size:13px; font-weight:700; letter-spacing:.4px; }
  .metrics { display:table; width:100%; table-layout:fixed; border-collapse:collapse; }
  .metric-cell { display:table-cell; text-align:center; padding:20px 8px; border-right:1px solid #eef0f2; }
  .metric-cell:last-child { border-right:none; }
  .metric-value { font-size:28px; font-weight:800; line-height:1; }
  .metric-label { margin-top:6px; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#888; }
  .bar-wrap { padding: 4px 28px 24px 28px; }
  .bar-track { width:100%; height:18px; border-radius:9px; overflow:hidden; background:#eef0f2; display:flex; }
  .bar-legend { margin-top:10px; font-size:12px; color:#555; }
  .bar-legend span { display:inline-block; margin-right:16px; }
  .swatch { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:middle; }
  .section-title { padding:18px 28px 4px 28px; font-size:14px; font-weight:700; color:#1c1f24; }
  table.results { width:100%; border-collapse:collapse; }
  table.results thead th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:#888; padding:10px 12px; border-bottom:2px solid #eef0f2; }
  .footer { text-align:center; font-size:11px; color:#98a0ab; padding: 8px 0 20px 0; }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>AX Ops Activity — Automated Test Execution Summary</h1>
        <p>Run window: ${m.startedAt.replace('T', ' ').slice(0, 19)} UTC → ${m.finishedAt.replace('T', ' ').slice(0, 19)} UTC &nbsp;•&nbsp; Environment: ${escapeHtml(m.environment.baseUrl)}</p>
        <span class="status-pill" style="background:${overallColor};color:#ffffff;">${overallLabel}</span>
      </div>

      <div class="metrics">
        <div class="metric-cell"><div class="metric-value" style="color:#1c1f24;">${m.total}</div><div class="metric-label">Total Tests</div></div>
        <div class="metric-cell"><div class="metric-value" style="color:${STATUS_COLORS.passed};">${m.passed + m.flaky}</div><div class="metric-label">Passed</div></div>
        <div class="metric-cell"><div class="metric-value" style="color:${STATUS_COLORS.failed};">${m.failed}</div><div class="metric-label">Failed</div></div>
        <div class="metric-cell"><div class="metric-value" style="color:${STATUS_COLORS.skipped};">${m.skipped}</div><div class="metric-label">Skipped</div></div>
        <div class="metric-cell"><div class="metric-value" style="color:#1c1f24;">${fmtDuration(m.durationMs)}</div><div class="metric-label">Duration</div></div>
      </div>

      <div class="bar-wrap">
        <div class="bar-track">
          <div style="width:${passSegmentPct}%;background:${STATUS_COLORS.passed};"></div>
          <div style="width:${failSegmentPct}%;background:${STATUS_COLORS.failed};"></div>
          <div style="width:${skipSegmentPct}%;background:${STATUS_COLORS.skipped};"></div>
        </div>
        <div class="bar-legend">
          <span><i class="swatch" style="background:${STATUS_COLORS.passed};"></i>Passed (${passSegmentPct}%)</span>
          <span><i class="swatch" style="background:${STATUS_COLORS.failed};"></i>Failed (${failSegmentPct}%)</span>
          <span><i class="swatch" style="background:${STATUS_COLORS.skipped};"></i>Skipped (${skipSegmentPct}%)</span>
          <span style="float:right;font-weight:700;color:#1c1f24;">Pass rate: ${m.passRate}%</span>
        </div>
      </div>

      <div class="section-title">Test Details</div>
      <table class="results">
        <thead>
          <tr>
            <th>Spec</th>
            <th>Test</th>
            <th style="text-align:center;">Status</th>
            <th style="text-align:right;">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#888;">No tests were executed.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="footer">Generated automatically by the AX-OpsActivity-Automation Playwright suite. Full interactive report and traces are attached / linked separately.</div>
  </div>
</body>
</html>`;
}
