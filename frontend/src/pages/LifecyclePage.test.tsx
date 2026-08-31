import { LifecyclePage } from '@/pages/LifecyclePage';
import { withI18n } from '@/test/i18n-wrapper';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-lifecycle-page', () => ({
  useLifecyclePage: () => ({
    buckets: [{ name: 'demo', publicRead: false, encryptAtRest: false }],
    bucketsLoading: false,
    bucketsError: '',
    selectedBucket: 'demo',
    onBucketChange: vi.fn(),
    rules: [],
    updateRules: vi.fn(),
    loading: false,
    saving: false,
    error: '',
    msg: '',
    dirty: false,
    saveRules: vi.fn(),
    clearRules: vi.fn(),
    reloadRules: vi.fn(),
  }),
}));

describe('LifecyclePage', () => {
  it('renders lifecycle header', () => {
    render(withI18n(<LifecyclePage />));
    expect(screen.getByTestId('lifecycle-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lifecycle' })).toBeInTheDocument();
  });
});
