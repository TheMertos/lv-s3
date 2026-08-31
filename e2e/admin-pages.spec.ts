import { expect, test } from '@playwright/test';

import { loginAsAdmin } from './helpers/login';

test('audit page loads after login', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/app/audit');
  const audit = page.getByTestId('audit-page');
  await expect(audit).toBeVisible();
  await expect(audit.getByRole('heading', { name: 'Audit log' })).toBeVisible();
});

test('uploads page loads after login', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/app/uploads');
  const uploads = page.getByTestId('uploads-page');
  await expect(uploads).toBeVisible();
  await expect(uploads.getByRole('heading', { name: 'Multipart uploads' })).toBeVisible();
});

test('s3 credentials page loads after login', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/app/s3-credentials');
  const creds = page.getByTestId('s3-credentials-page');
  await expect(creds).toBeVisible();
  await expect(creds.getByRole('heading', { name: 'S3 credentials' })).toBeVisible();
});

test('buckets page loads after login', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/app/buckets');
  const buckets = page.getByTestId('buckets-page');
  await expect(buckets).toBeVisible();
  await expect(buckets.getByRole('heading', { name: 'Buckets' })).toBeVisible();
});

test('service accounts page loads after login', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/app/service-accounts');
  const accounts = page.getByTestId('service-accounts-page');
  await expect(accounts).toBeVisible();
  await expect(accounts.getByRole('heading', { name: 'Service accounts' })).toBeVisible();
});
