import { BucketsPage } from '@/pages/BucketsPage';
import { withI18n } from '@/test/i18n-wrapper';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    token: 'test-token',
    buckets: [],
    bucketsLoading: false,
    bucketsError: '',
    loadBuckets: vi.fn(),
  }),
}));

describe('BucketsPage', () => {
  it('renders buckets header', () => {
    render(withI18n(<BucketsPage />));
    const page = screen.getByTestId('buckets-page');
    expect(page).toBeInTheDocument();
    expect(within(page).getByRole('heading', { name: 'Buckets' })).toBeInTheDocument();
  });
});
