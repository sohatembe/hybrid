#!/usr/bin/env node
/**
 * run-tests-and-notify.js
 * ---------------------------------------------------------------------------
 * Runs the Playwright suite, then ALWAYS attempts to email the executive
 * summary afterward — on a green run and on a red one alike (leadership
 * especially wants to hear about the red ones). Finally re-exits with the
 * test run's original status code, so CI still fails correctly even though
 * the email step ran after it.
 *
 * Plain Node + child_process.spawnSync — no shell-specific `&&`/`;`
 * chaining — so this works identically on Windows, macOS, and Linux/CI.
 * ---------------------------------------------------------------------------
 */
const { spawnSync } = require('child_process');

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}\n`);
  return spawnSync(command, args, { stdio: 'inherit', shell: true });
}

const testRun = run('npx', ['playwright', 'test']);

console.log('\n--- Test run finished. Sending executive summary email... ---\n');
const emailRun = run('npx', ['ts-node', 'utils/emailSender.ts']);

if (emailRun.status !== 0) {
  console.warn('\nWARNING: the executive summary email could not be sent. Check SMTP settings in .env.\n');
}

// Preserve the *test* run's exit code so CI still reports failures correctly.
process.exit(testRun.status ?? 1);
