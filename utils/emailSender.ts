/**
 * emailSender.ts
 * ---------------------------------------------------------------------------
 * Reads the standalone executive HTML summary produced by
 * utils/executive-summary-reporter.ts and emails it via Nodemailer, with the
 * dashboard rendered directly in the email body (not just attached) so a
 * non-technical manager sees the pass/fail metrics the instant they open the
 * message — no download required.
 *
 * Run standalone:   npm run email:send
 * Run after tests:  npm run test:notify   (see scripts/run-tests-and-notify.js)
 * ---------------------------------------------------------------------------
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import archiver from 'archiver';

const SUMMARY_HTML_PATH = path.resolve(__dirname, '..', 'playwright-report', 'executive-summary.html');
const SUMMARY_JSON_PATH = path.resolve(__dirname, '..', 'playwright-report', 'executive-summary.json');
const PLAYWRIGHT_REPORT_DIR = path.resolve(__dirname, '..', 'playwright-report');
const ALLURE_REPORT_DIR = path.resolve(__dirname, '..', 'allure-report');

interface Metrics {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  passRate: number;
  durationMs: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable "${name}". Copy .env.example to .env and fill it in.`);
  }
  return value;
}

function readMetrics(): Metrics | null {
  if (!fs.existsSync(SUMMARY_JSON_PATH)) return null;
  return JSON.parse(fs.readFileSync(SUMMARY_JSON_PATH, 'utf-8'));
}

/** Zips a directory (if it exists) into a Buffer, for attaching the full interactive report(s). */
async function zipDirectory(dir: string): Promise<Buffer | null> {
  if (!fs.existsSync(dir)) return null;

  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    archive.directory(dir, false);
    archive.finalize();
  });
}

async function buildTransport() {
  return nodemailer.createTransport({
    host: requiredEnv('SMTP_HOST'),
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true',
    auth: {
      user: requiredEnv('SMTP_USER'),
      pass: requiredEnv('SMTP_PASSWORD'),
    },
  });
}

async function main(): Promise<void> {
  if (!fs.existsSync(SUMMARY_HTML_PATH)) {
    throw new Error(
      `Executive summary not found at ${SUMMARY_HTML_PATH}. Run "npm test" first — the ` +
        'executive-summary-reporter runs automatically as part of the Playwright test run.'
    );
  }

  const dashboardHtml = fs.readFileSync(SUMMARY_HTML_PATH, 'utf-8');
  const metrics = readMetrics();

  const subjectPrefix = process.env.REPORT_SUBJECT_PREFIX ?? '[AX Automation]';
  const overall = metrics && metrics.failed > 0 ? 'FAILURES DETECTED' : 'All Passed';
  const subject = `${subjectPrefix} Test Run Summary — ${overall} (${new Date().toLocaleDateString()})`;

  const toList = requiredEnv('REPORT_TO_EMAIL')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ccList = (process.env.REPORT_CC_EMAIL ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const attachments: { filename: string; content: Buffer }[] = [];

  if ((process.env.ATTACH_FULL_REPORT ?? 'true').toLowerCase() === 'true') {
    const [playwrightZip, allureZip] = await Promise.all([
      zipDirectory(PLAYWRIGHT_REPORT_DIR),
      zipDirectory(ALLURE_REPORT_DIR),
    ]);

    if (playwrightZip) {
      attachments.push({ filename: 'playwright-report.zip', content: playwrightZip });
    }
    if (allureZip) {
      attachments.push({ filename: 'allure-report.zip', content: allureZip });
    }
  }

  const transport = await buildTransport();

  const info = await transport.sendMail({
    from: `"${process.env.REPORT_FROM_NAME ?? 'AX QA Automation'}" <${requiredEnv('REPORT_FROM_EMAIL')}>`,
    to: toList,
    cc: ccList.length ? ccList : undefined,
    subject,
    html: dashboardHtml, // the executive dashboard IS the email body — no click-through needed
    attachments,
  });

  console.log(`Executive summary emailed to: ${toList.join(', ')}`);
  console.log(`Message ID: ${info.messageId}`);
  if (attachments.length) {
    console.log(`Attached: ${attachments.map((a) => a.filename).join(', ')}`);
  }
}

main().catch((err) => {
  console.error('Failed to send executive summary email:', err);
  process.exitCode = 1;
});
