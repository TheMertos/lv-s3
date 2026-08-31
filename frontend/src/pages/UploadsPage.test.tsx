import { UploadsPage } from '@/pages/UploadsPage';
import { withI18n } from '@/test/i18n-wrapper';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    token: 'test-token',
    buckets: [{ name: 'demo', publicRead: false, encryptAtRest: false }],
    bucketsLoading: false,
    bucketsError: '',
    loadBuckets: vi.fn(),
  }),
}));

vi.mock('@/api/admin', () => ({
  listMultipartUploads: vi.fn().mockResolvedValue([]),
  abortMultipart: vi.fn(),
}));

describe('UploadsPage', () => {
  it('renders multipart uploads header', () => {
    render(withI18n(<UploadsPage />));
    expect(screen.getByTestId('uploads-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Multipart uploads' })).toBeInTheDocument();
  });
});
