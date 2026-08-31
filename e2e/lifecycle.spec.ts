import { expect, test } from '@playwright/test';

import { loginAsAdmin } from './helpers/login';

test('lifecycle page loads after login', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/app/lifecycle');
  const lifecycle = page.getByTestId('lifecycle-page');
  await expect(lifecycle).toBeVisible();
  await expect(lifecycle.getByRole('heading', { name: 'Lifecycle' })).toBeVisible();
});
