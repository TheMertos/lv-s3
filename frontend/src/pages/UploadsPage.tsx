import * as admin from '@/api/admin';
import { PageErrorAlert } from '@/components/common/PageErrorAlert';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/context/auth-context';
import { useT } from '@/i18n/context';
import { formatDate } from '@/lib/format';

import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useState } from 'react';

/**
 * Lists in-progress multipart uploads per bucket with abort action.
 */
export function UploadsPage() {
  const t = useT();
  const { token, buckets, bucketsLoading, bucketsError, loadBuckets } = useAuth();
  const [selectedBucket, setSelectedBucket] = useState('');
  const [rows, setRows] = useState<admin.MultipartUploadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [abortTarget, setAbortTarget] = useState<admin.MultipartUploadRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadBuckets();
  }, [loadBuckets]);

  useEffect(() => {
    if (!selectedBucket && buckets.length > 0) {
      setSelectedBucket(buckets[0]?.name ?? '');
    }
  }, [buckets, selectedBucket]);

  const loadUploads = useCallback(async () => {
    if (!token || !selectedBucket) return;
    setLoading(true);
    setError('');
    try {
      setRows(await admin.listMultipartUploads(token, selectedBucket));
    } catch (e) {
      setRows([]);
      setError(String((e as Error).message || t('uploads.failedLoad')));
    } finally {
      setLoading(false);
    }
  }, [token, selectedBucket, t]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  const confirmAbort = async () => {
    if (!abortTarget || !token || !selectedBucket) return;
    setBusy(true);
    try {
      await admin.abortMultipart(token, selectedBucket, abortTarget.uploadId);
      notifications.show({ message: t('uploads.aborted'), color: 'green' });
      setAbortTarget(null);
      await loadUploads();
    } catch (e) {
      notifications.show({
        message: String((e as Error).message || t('common.somethingWentWrong')),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md" data-testid="uploads-page">
      <PageHeader
        title={t('uploads.title')}
        subtitle={t('uploads.subtitle')}
        right={
          <Group gap="sm">
            <Select
              data={buckets.map((b) => ({ value: b.name, label: b.name }))}
              value={selectedBucket || null}
              onChange={(v) => setSelectedBucket(v ?? '')}
              placeholder={t('uploads.selectBucket')}
              disabled={bucketsLoading || buckets.length === 0}
              searchable
              w={220}
            />
            <Button variant="default" onClick={() => void loadUploads()} disabled={!selectedBucket || loading}>
              {t('common.reload')}
            </Button>
          </Group>
        }
      />

      <Alert title={t('uploads.title')} variant="light">
        {t('uploads.subtitle')}
      </Alert>

      <PageErrorAlert message={bucketsError} title={t('errors.failedLoadBuckets')} />
      <PageErrorAlert message={error} title={t('uploads.failedLoad')} />

      {loading ? (
        <TableSkeleton columns={4} />
      ) : (
        <Table withTableBorder striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('uploads.uploadId')}</Table.Th>
              <Table.Th>{t('uploads.key')}</Table.Th>
              <Table.Th>{t('uploads.createdAt')}</Table.Th>
              <Table.Th ta="right">{t('common.remove')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" ta="center" py="lg">
                    {t('uploads.noUploads')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              rows.map((row) => (
                <Table.Tr key={row.uploadId}>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {row.uploadId}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {row.key}
                    </Text>
                  </Table.Td>
                  <Table.Td>{formatDate(row.createdAt)}</Table.Td>
                  <Table.Td ta="right">
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      onClick={() => setAbortTarget(row)}
                    >
                      {t('uploads.abort')}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={!!abortTarget}
        onClose={() => setAbortTarget(null)}
        title={t('uploads.abortConfirm')}
      >
        {abortTarget ? (
          <Stack gap="sm">
            <Text size="sm" ff="monospace">
              {abortTarget.key}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {abortTarget.uploadId}
            </Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setAbortTarget(null)}>
                {t('common.cancel')}
              </Button>
              <Button color="red" loading={busy} onClick={() => void confirmAbort()}>
                {t('uploads.abort')}
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
