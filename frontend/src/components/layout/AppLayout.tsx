import { Logo } from '@/components/branding/Logo';
import { useAuth } from '@/context/auth-context';
import { useT } from '@/i18n/context';

import {
  AppShell,
  Box,
  Button,
  NavLink,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconDatabase,
  IconFolderOpen,
  IconHistory,
  IconKey,
  IconClock,
  IconServer,
  IconShield,
  IconUpload,
} from '@tabler/icons-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

type NavItem = {
  to: string;
  label: string;
  icon: typeof IconFolderOpen;
};

/**
 * Authenticated Mantine AppShell: sidebar navigation and main content outlet.
 */
export function AppLayout() {
  const { logout } = useAuth();
  const t = useT();
  const loc = useLocation();
  const navigate = useNavigate();

  const navItems: NavItem[] = [
    { to: '/app/browser', label: t('nav.browser'), icon: IconFolderOpen },
    { to: '/app/buckets', label: t('nav.buckets'), icon: IconDatabase },
    { to: '/app/lifecycle', label: t('nav.lifecycle'), icon: IconClock },
    { to: '/app/service-accounts', label: t('nav.serviceAccounts'), icon: IconKey },
    { to: '/app/iam-policies', label: t('nav.iamPolicies'), icon: IconShield },
    { to: '/app/uploads', label: t('nav.uploads'), icon: IconUpload },
    { to: '/app/audit', label: t('nav.audit'), icon: IconHistory },
    { to: '/app/s3-credentials', label: t('nav.s3Credentials'), icon: IconServer },
  ];

  const activeItem =
    navItems.find((item) => loc.pathname.startsWith(item.to)) ??
    navItems.find((item) => item.to.includes('/browser'));

  return (
    <AppShell
      navbar={{
        width: 260,
        breakpoint: 'sm',
      }}
      padding="md"
      styles={{
        navbar: {
          backgroundColor: 'var(--mantine-color-dark-8)',
          borderRight: '1px solid var(--mantine-color-default-border)',
        },
        main: {
          backgroundColor: 'var(--mantine-color-body)',
        },
      }}
    >
      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Logo />
        </AppShell.Section>
        <AppShell.Section grow component={ScrollArea} mt="md">
          <Stack gap={4}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                label={item.label}
                leftSection={<item.icon size={18} stroke={1.5} />}
                active={loc.pathname.startsWith(item.to)}
                onClick={() => navigate(item.to)}
              />
            ))}
          </Stack>
        </AppShell.Section>
        <AppShell.Section>
          <Box
            p="sm"
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              border: '1px solid var(--mantine-color-default-border)',
              background: 'var(--mantine-color-default)',
            }}
          >
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">
              S3 API
            </Text>
            <Text size="xs" c="dimmed" mt={4}>{t('nav.s3Port')}</Text>
            <Text size="xs" c="dimmed" mt={4}>{t('nav.s3ApiHint')}</Text>
          </Box>
          <Button variant="default" fullWidth mt="sm" onClick={logout}>
            {t('common.signOut')}
          </Button>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Text size="sm" c="dimmed" mb="sm">
          {t('common.console')}
          <Text span mx={6} c="dimmed">/</Text>
          <Text span fw={500}>{activeItem?.label ?? t('common.console')}</Text>
        </Text>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
