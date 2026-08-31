import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Default E2E admin username (matches start-backend bootstrap). */
export const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'e2eadmin';

/** Default E2E admin password (matches start-backend bootstrap). */
export const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'E2ePlaywrightPassword123!';

/**
 * Signs in via the login page and waits for the object browser shell.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('login-username').fill(ADMIN_USER);
  await page.getByTestId('login-password').fill(ADMIN_PASS);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('browser-page')).toBeVisible({ timeout: 60_000 });
}
