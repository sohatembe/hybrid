import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginPage } from '../pages/LoginPage';
import { AUTH_FILE, CREDENTIALS } from '../lib/Global';

setup('Microsoft Login Authentication', async ({ page }) => {
  setup.setTimeout(5 * 60 * 1000); // 5 min — accommodates manual MFA approval

  const loginPage = new LoginPage(page);
  await loginPage.loginWithMicrosoft(CREDENTIALS.email, CREDENTIALS.password);

  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });

  console.log('Auth state saved.');
});
