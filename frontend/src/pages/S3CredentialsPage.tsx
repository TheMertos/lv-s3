import * as admin from '@/api/admin';
import { PageErrorAlert } from '@/components/common/PageErrorAlert';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/context/auth-context';
import { useT } from '@/i18n/context';

import {
  Alert,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useState } from 'react';

/**
 * Shows admin S3 access key metadata; load or rotate credentials with confirmation.
 */
export function S3CredentialsPage() {
  const t = useT();
  const { token } = useAuth();
  const [accessKeyMeta, setAccessKeyMeta] = useState<string | null | undefined>(undefined);
  const [credentials, setCredentials] = useState<admin.S3Credentials | null>(null);
  const [metaError, setMetaError] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadConfirmOpen, setLoadConfirmOpen] = useState(false);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadMeta = useCallback(async () => {
    if (!token) return;
    setLoadingMeta(true);
    setMetaError('');
    try {
      const meta = await admin.getS3AccessKeyMeta(token);
      const key = meta.accessKey;
      setAccessKeyMeta(typeof key === 'string' ? key : key ? String(key) : null);
    } catch (e) {
      setAccessKeyMeta(undefined);
      setMetaError(String((e as Error).message || t('s3Credentials.failedLoadMeta')));
    } finally {
      setLoadingMeta(false);
    }
  }, [token, t]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const loadCredentials = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const creds = await admin.getS3Credentials(token);
      setCredentials(creds);
      setAccessKeyMeta(creds.accessKey);
      notifications.show({ message: t('s3Credentials.loaded'), color: 'green' });
      setLoadConfirmOpen(false);
    } catch (e) {
      notifications.show({
        message: String((e as Error).message || t('s3Credentials.failedLoad')),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  const rotateCredentials = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const creds = await admin.rotateS3Credentials(token);
      setCredentials(creds);
      setAccessKeyMeta(creds.accessKey);
      notifications.show({ message: t('s3Credentials.rotated'), color: 'green' });
      setRotateConfirmOpen(false);
    } catch (e) {
      notifications.show({
        message: String((e as Error).message || t('s3Credentials.failedRotate')),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md" data-testid="s3-credentials-page">
      <PageHeader title={t('s3Credentials.title')} subtitle={t('s3Credentials.subtitle')} />

      <Alert title={t('s3Credentials.alertTitle')} variant="light">
        {t('s3Credentials.alertDescription')}
      </Alert>

      <PageErrorAlert message={metaError} title={t('s3Credentials.failedLoadMeta')} />

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <div>
            <Text size="sm" c="dimmed">
              {t('s3Credentials.accessKey')}
            </Text>
            {loadingMeta ? (
              <Text size="sm">{t('common.loading')}</Text>
            ) : accessKeyMeta ? (
              <Text ff="monospace" size="sm">
                {accessKeyMeta}
              </Text>
            ) : (
              <Text size="sm" c="dimmed">
                {t('s3Credentials.noKeyYet')}
              </Text>
            )}
          </div>

          {credentials ? (
            <Stack gap="sm">
              <div>
                <Text size="sm" c="dimmed">
                  {t('s3Credentials.secretKey')}
                </Text>
                <Text ff="monospace" size="sm">
                  {credentials.secretKey}
                </Text>
              </div>
              <Group gap="sm">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(credentials.accessKey)}
                >
                  {t('s3Credentials.copyAccessKey')}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(credentials.secretKey)}
                >
                  {t('s3Credentials.copySecretKey')}
                </Button>
              </Group>
            </Stack>
          ) : null}

          <Group gap="sm">
            <Button onClick={() => setLoadConfirmOpen(true)} disabled={busy}>
              {t('s3Credentials.loadCredentials')}
            </Button>
            <Button variant="default" color="orange" onClick={() => setRotateConfirmOpen(true)} disabled={busy}>
              {t('s3Credentials.rotate')}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Modal
        opened={loadConfirmOpen}
        onClose={() => setLoadConfirmOpen(false)}
        title={t('s3Credentials.loadCredentials')}
      >
        <Stack gap="md">
          <Text size="sm">{t('s3Credentials.loadConfirm')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setLoadConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={busy} onClick={() => void loadCredentials()}>
              {t('s3Credentials.loadCredentials')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={rotateConfirmOpen}
        onClose={() => setRotateConfirmOpen(false)}
        title={t('s3Credentials.rotate')}
      >
        <Stack gap="md">
          <Text size="sm">{t('s3Credentials.rotateConfirm')}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRotateConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button color="orange" loading={busy} onClick={() => void rotateCredentials()}>
              {t('s3Credentials.rotate')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
