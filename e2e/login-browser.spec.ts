import { expect, test } from '@playwright/test';

import { loginAsAdmin } from './helpers/login';

test('login redirects to object browser', async ({ page }) => {
  await loginAsAdmin(page);
  const browser = page.getByTestId('browser-page');
  await expect(browser).toBeVisible();
  await expect(browser.getByRole('heading', { name: 'Object Browser' })).toBeVisible();
});

test('login shows error for invalid credentials', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-username').fill('e2eadmin');
  await page.getByTestId('login-password').fill('not-the-password');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toBeVisible();
});
