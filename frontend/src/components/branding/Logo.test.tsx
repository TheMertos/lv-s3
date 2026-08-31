import { Logo } from '@/components/branding/Logo';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('Logo', () => {
  it('renders the product mark and wordmark', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'LV S3' })).toHaveAttribute('src', '/lv-s3-logo.png');
    expect(screen.getByText('LV S3')).toBeInTheDocument();
    expect(screen.getByText('Console')).toBeInTheDocument();
  });

  it('uses the compact mark by default and a larger mark on login', () => {
    const { rerender } = render(<Logo />);
    expect(screen.getByRole('img', { name: 'LV S3' })).toHaveAttribute('width', '40');
    rerender(<Logo size="lg" />);
    expect(screen.getByRole('img', { name: 'LV S3' })).toHaveAttribute('width', '72');
  });
});
