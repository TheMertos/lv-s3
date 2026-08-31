import { AuditPage } from '@/pages/AuditPage';
import { withI18n } from '@/test/i18n-wrapper';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('@/api/admin', () => ({
  listAuditLogs: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
  }),
}));

describe('AuditPage', () => {
  it('renders audit log header', () => {
    render(withI18n(<AuditPage />));
    expect(screen.getByTestId('audit-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Audit log' })).toBeInTheDocument();
  });
});
