import { expect, test } from '@playwright/test';

import { loginAsAdmin } from './helpers/login';

const POLICY_NAME = `e2e-get-only-${Date.now()}`;
const E2E_BUCKET = 'e2e-bucket';
const SA_LABEL = `e2e-iam-sa-${Date.now()}`;

test('IAM policies: create policy and attach to service account', async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto('/app/iam-policies');
  const iamPage = page.getByTestId('iam-policies-page');
  await expect(iamPage).toBeVisible();
  await expect(iamPage.getByRole('heading', { name: 'IAM policies' })).toBeVisible();

  await iamPage.getByRole('button', { name: 'Create policy' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create IAM policy' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Policy name').fill(POLICY_NAME);

  const resourceInput = dialog.getByPlaceholder('arn:lv-s3:::my-bucket/*');
  await resourceInput.fill(`arn:lv-s3:::${E2E_BUCKET}/*`);

  await dialog.getByRole('button', { name: 'Add resource' }).click();
  const resourceInputs = dialog.getByPlaceholder('arn:lv-s3:::my-bucket/*');
  await resourceInputs.nth(1).fill(`arn:lv-s3:::${E2E_BUCKET}`);

  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(POLICY_NAME)).toBeVisible();

  await page.goto('/app/service-accounts');
  const saPage = page.getByTestId('service-accounts-page');
  await expect(saPage).toBeVisible();

  await saPage.getByRole('button', { name: 'Create service account' }).click();
  const createSaDialog = page.getByRole('dialog', { name: 'Create service account' });
  await createSaDialog.getByLabel('Label (optional)').fill(SA_LABEL);
  await createSaDialog.getByRole('button', { name: 'Create' }).click();
  await expect(createSaDialog).not.toBeVisible({ timeout: 15_000 });

  const credentialsDialog = page.getByRole('dialog', { name: 'Save these credentials' });
  await expect(credentialsDialog).toBeVisible();
  await credentialsDialog.getByRole('button', { name: 'Done' }).click();
  await expect(credentialsDialog).not.toBeVisible();

  const saRow = saPage.locator('tr').filter({ hasText: SA_LABEL });
  await expect(saRow).toBeVisible();

  await saRow.getByRole('button', { name: 'Attach', exact: true }).click();
  const attachDialog = page.getByRole('dialog', { name: 'Attach IAM policy' });
  await expect(attachDialog).toBeVisible();

  await attachDialog.getByLabel('Policy').click();
  await page.getByRole('option', { name: POLICY_NAME }).click();
  await attachDialog.getByRole('button', { name: 'Attach', exact: true }).click();
  await expect(attachDialog).not.toBeVisible({ timeout: 15_000 });

  await expect(saRow.getByText(POLICY_NAME)).toBeVisible();
});
