
import { Logo } from '@/components/branding/Logo';
import { useAuthSession } from '@/context/auth-session';
import { useT } from '@/i18n/context';

import { Alert, Button, Card, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Admin sign-in screen; stores access token in memory and redirects to the object browser.
 */
export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const { login, accessToken, isReady } = useAuthSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isReady && accessToken) {
      navigate('/app/browser', { replace: true });
    }
  }, [isReady, accessToken, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/app/browser');
    } catch (e) {
      setErr(String((e as Error).message || t('login.failed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack
      align="center"
      justify="center"
      mih="100vh"
      px="md"
      py="xl"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <div className="lv-login-backdrop" aria-hidden />
      <Stack maw={420} w="100%" gap="xl" style={{ position: 'relative' }}>
        <Logo size="lg" />
        <Card withBorder shadow="sm" radius="md" padding="lg">
          <Stack gap="md">
            <div>
              <Title order={3}>{t('login.title')}</Title>
              <Text size="sm" c="dimmed" mt={4}>
                {t('login.description')}
              </Text>
            </div>
            <form onSubmit={submit} data-testid="login-form">
              <Stack gap="md">
                <TextInput
                  label={t('login.username')}
                  id="login-user"
                  data-testid="login-username"
                  autoComplete="username"
                  placeholder={t('login.username')}
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value)}
                  required
                />
                <PasswordInput
                  label={t('login.password')}
                  id="login-pass"
                  data-testid="login-password"
                  autoComplete="current-password"
                  placeholder={t('login.password')}
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  required
                />
                {err ? (
                  <Alert color="red" data-testid="login-error">
                    {err}
                  </Alert>
                ) : null}
                <Button type="submit" data-testid="login-submit" fullWidth loading={loading}>
                  {t('common.signIn')}
                </Button>
              </Stack>
            </form>
          </Stack>
        </Card>
        <Text size="xs" c="dimmed" ta="center">
          {t('login.tagline')}
        </Text>
      </Stack>
    </Stack>
  );
}
