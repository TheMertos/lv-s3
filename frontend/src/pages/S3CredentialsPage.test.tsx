import { S3CredentialsPage } from '@/pages/S3CredentialsPage';
import { withI18n } from '@/test/i18n-wrapper';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('@/api/admin', () => ({
  getS3AccessKeyMeta: vi.fn().mockResolvedValue({ accessKey: 'lvadmin123' }),
  getS3Credentials: vi.fn(),
  rotateS3Credentials: vi.fn(),
}));

describe('S3CredentialsPage', () => {
  it('renders s3 credentials header', () => {
    render(withI18n(<S3CredentialsPage />));
    expect(screen.getByTestId('s3-credentials-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'S3 credentials' })).toBeInTheDocument();
  });
});
