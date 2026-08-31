import { LoginPage } from '@/pages/LoginPage';
import { withI18n } from '@/test/i18n-wrapper';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loginMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/context/auth-session', () => ({
  useAuthSession: () => ({
    login: loginMock,
    logout: vi.fn(),
    accessToken: null,
    isReady: true,
    setAccessToken: vi.fn(),
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  MemoryRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Navigate: () => null,
  Route: () => null,
  Routes: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Outlet: () => null,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset();
    navigateMock.mockReset();
  });

  it('renders sign-in form fields', () => {
    render(withI18n(<LoginPage />));
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(screen.getByTestId('login-username')).toBeInTheDocument();
    expect(screen.getByTestId('login-password')).toBeInTheDocument();
    expect(screen.getByTestId('login-submit')).toHaveTextContent('Sign in');
    expect(screen.getByRole('img', { name: 'LV S3' })).toHaveAttribute('width', '72');
  });

  it('shows error when login fails', async () => {
    loginMock.mockRejectedValue(new Error('Unauthorized'));
    const user = userEvent.setup();
    render(withI18n(<LoginPage />));
    const form = screen.getByTestId('login-form');
    await user.type(within(form).getByTestId('login-username'), 'admin');
    await user.type(within(form).getByTestId('login-password'), 'wrong');
    await user.click(within(form).getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Unauthorized');
  });

  it('calls auth session login on success', async () => {
    loginMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(withI18n(<LoginPage />));
    const form = screen.getByTestId('login-form');
    await user.type(within(form).getByTestId('login-username'), 'admin');
    await user.type(within(form).getByTestId('login-password'), 'secret');
    await user.click(within(form).getByTestId('login-submit'));
    expect(loginMock).toHaveBeenCalledWith('admin', 'secret');
    expect(navigateMock).toHaveBeenCalledWith('/app/browser');
  });
});
