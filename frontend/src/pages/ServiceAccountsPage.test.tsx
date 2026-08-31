import * as admin from '@/api/admin';
import { ServiceAccountsPage } from '@/pages/ServiceAccountsPage';
import { withI18n } from '@/test/i18n-wrapper';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('@/api/admin', () => ({
  listServiceAccounts: vi.fn(),
  listIamPolicies: vi.fn(),
  listServiceAccountPolicies: vi.fn(),
  createServiceAccount: vi.fn(),
  disableServiceAccount: vi.fn(),
  deleteServiceAccount: vi.fn(),
  attachIamPolicy: vi.fn(),
  detachIamPolicy: vi.fn(),
}));

describe('ServiceAccountsPage', () => {
  beforeEach(() => {
    vi.mocked(admin.listServiceAccounts).mockResolvedValue([
      {
        id: 1,
        accessKey: 'AKIA_TEST_KEY',
        // Generated OpenAPI types map nullable strings oddly; cast for the mock.
        label: 'ci-bot' as unknown as Record<string, never>,
        disabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    vi.mocked(admin.listIamPolicies).mockResolvedValue([
      { id: 10, name: 'read-only', document: { Statement: [] }, createdAt: '', updatedAt: '' },
    ]);
    vi.mocked(admin.listServiceAccountPolicies).mockResolvedValue([
      { id: 10, name: 'read-only', document: { Statement: [] }, createdAt: '', updatedAt: '' },
    ]);
  });

  it('renders service accounts header', () => {
    render(withI18n(<ServiceAccountsPage />));
    const page = screen.getByTestId('service-accounts-page');
    expect(page).toBeInTheDocument();
    expect(within(page).getByRole('heading', { name: 'Service accounts' })).toBeInTheDocument();
  });

  it('shows attached IAM policy names per service account', async () => {
    render(withI18n(<ServiceAccountsPage />));
    await waitFor(() => {
      expect(screen.getByText('read-only')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Attach' })).toBeInTheDocument();
  });

  it('surfaces attached-policy load failures instead of empty policies', async () => {
    vi.mocked(admin.listServiceAccountPolicies).mockRejectedValue(
      new Error('Failed to load attached policies'),
    );

    render(withI18n(<ServiceAccountsPage />));

    await waitFor(() => {
      expect(screen.getByText('Failed to load attached policies')).toBeInTheDocument();
    });
    expect(screen.queryByText('None')).not.toBeInTheDocument();
  });
});
