/**
 * LoginPage.ts
 * ---------------------------------------------------------------------------
 * Encapsulates the Microsoft SSO login flow (including manual MFA approval)
 * and the "Switch to Beta Admin Interface" hop. Logic ported 1:1 from the
 * original auth.setup.ts so behavior stays identical — only the selectors
 * and waits have been organized into named, reusable steps.
 * ---------------------------------------------------------------------------
 */
import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { TIMEOUTS } from '../lib/Global';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get microsoftLoginButton() {
    return this.page.getByRole('button', { name: 'Login with your Microsoft Account' });
  }

  private get emailInput() {
    return this.page.getByPlaceholder('Email, phone, or Skype');
  }

  private get nextButton() {
    return this.page.getByRole('button', { name: 'Next' });
  }

  private get passwordInput() {
    return this.page.getByPlaceholder('Password');
  }

  private get signInButton() {
    return this.page.getByRole('button', { name: 'Sign in' });
  }

  private get mfaApprovalPrompt() {
    return this.page.getByRole('heading', { name: 'Approve sign in request' });
  }

  private get staySignedInYesButton() {
    return this.page.getByRole('button', { name: 'Yes' });
  }

  private get switchToBetaLink() {
    return this.page.getByRole('link', { name: 'Switch to Beta Admin Interface' });
  }

  private get alreadyOnBetaLink() {
    return this.page.getByRole('link', { name: 'Switch to Old Admin Interface' });
  }

  /** Navigates to the app root and starts the Microsoft SSO flow. */
  async goto(): Promise<void> {
    await this.page.goto('https://ax.siteplug.com/');
    await this.microsoftLoginButton.click();
    await this.page.waitForURL(/login\.microsoftonline\.com/);
  }

  /** Submits email + password against the Microsoft login form. */
  async submitCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.nextButton.click();
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  /**
   * Waits for either the MFA "Approve sign in request" prompt or a
   * successful redirect away from the Microsoft login domain. If MFA is
   * required, waits (up to 2 minutes) for a human to approve it on their
   * device before continuing.
   */
  async handleMfaIfPresented(): Promise<void> {
    await Promise.race([
      this.mfaApprovalPrompt.waitFor({ state: 'visible', timeout: TIMEOUTS.mfaFirstCheck }).catch(() => {}),
      this.page
        .waitForURL((url) => !url.href.includes('login.microsoftonline.com'), { timeout: TIMEOUTS.mfaFirstCheck })
        .catch(() => {}),
    ]);

    if (await this.mfaApprovalPrompt.isVisible().catch(() => false)) {
      const codeText = await this.page
        .locator('text=/^\\d{2}$/')
        .first()
        .textContent()
        .catch(() => null);

      console.log('==================================================');
      console.log('ACTION REQUIRED: Approve the sign-in request on your');
      console.log('Microsoft Authenticator app now.');
      if (codeText) console.log(`Enter this number if prompted: ${codeText}`);
      console.log('Waiting up to 2 minutes for approval...');
      console.log('==================================================');

      await Promise.race([
        this.mfaApprovalPrompt.waitFor({ state: 'hidden', timeout: TIMEOUTS.mfaApproval }).catch(() => {}),
        this.page
          .waitForURL((url) => !url.href.includes('login.microsoftonline.com'), { timeout: TIMEOUTS.mfaApproval })
          .catch(() => {}),
      ]);
      console.log('MFA approved — continuing.');
    }
  }

  /** Dismisses the optional "Stay signed in?" prompt and confirms we left the Microsoft domain. */
  async finalizeMicrosoftSession(): Promise<void> {
    try {
      await this.staySignedInYesButton.click({ timeout: 8000 });
    } catch {
      // Popup didn't appear this run — continue.
    }

    if (this.page.url().includes('login.microsoftonline.com')) {
      await this.page.waitForURL((url) => !url.href.includes('login.microsoftonline.com'), { timeout: 30_000 });
    }

    console.log('Microsoft Login Successful');
    console.log('Current URL:', this.page.url());

    // index_sso.html is a transitional bridge page — it redirects to the
    // real app dashboard on its own after a further delay. Wait for that
    // second hop before looking for app-specific elements.
    if (this.page.url().includes('index_sso.html')) {
      console.log('On SSO bridge page, waiting for redirect to the app...');
      await this.page.waitForURL((url) => !url.href.includes('index_sso.html'), { timeout: 60_000 });
      console.log('Redirected to:', this.page.url());
    }
  }

  /**
   * Clicks "Switch to Beta Admin Interface" (or confirms it's already
   * active), which navigates straight to the Traffic Source Stats page.
   */
  async switchToBetaInterface(): Promise<void> {
    if (await this.switchToBetaLink.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await this.switchToBetaLink.click();
      console.log('Switched to Beta Admin Interface');
    } else if (await this.alreadyOnBetaLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Already on Beta Admin Interface — no switch needed');
    } else {
      await this.page.screenshot({ path: 'debug-unexpected-state.png', fullPage: true });
      throw new Error('Neither "Switch to Beta" nor "Switch to Old" link found — see debug-unexpected-state.png');
    }

    await this.page.waitForLoadState('networkidle', { timeout: 30_000 });
    await expect(this.page.getByText('Traffic Source Stats')).toBeVisible({ timeout: TIMEOUTS.dataLoad });
    console.log('Landed on Traffic Source Stats page');
  }

  /** Full end-to-end login used by auth.setup.ts. */
  async loginWithMicrosoft(email: string, password: string): Promise<void> {
    await this.goto();
    await this.submitCredentials(email, password);
    await this.handleMfaIfPresented();
    await this.finalizeMicrosoftSession();
    await this.switchToBetaInterface();
  }
}
