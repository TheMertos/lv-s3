import { IamPoliciesPage } from '@/pages/IamPoliciesPage';
import { withI18n } from '@/test/i18n-wrapper';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('@/api/admin', () => ({
  listIamPolicies: vi.fn().mockResolvedValue([]),
  createIamPolicy: vi.fn(),
  updateIamPolicy: vi.fn(),
  deleteIamPolicy: vi.fn(),
}));

describe('IamPoliciesPage', () => {
  it('renders IAM policies header', () => {
    render(withI18n(<IamPoliciesPage />));
    const page = screen.getByTestId('iam-policies-page');
    expect(page).toBeInTheDocument();
    expect(within(page).getByRole('heading', { name: 'IAM policies' })).toBeInTheDocument();
  });
});
