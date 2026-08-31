
import * as admin from '@/api/admin';
import { CreateBucketDialog } from '@/components/buckets/CreateBucketDialog';
import { PageErrorAlert } from '@/components/common/PageErrorAlert';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/context/auth-context';
import { useT } from '@/i18n/context';

import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';

/**
 * Bucket management: create buckets and toggle public-read policy.
 */
export function BucketsPage() {
  const t = useT();
  const { token, buckets, bucketsLoading, bucketsError, loadBuckets } = useAuth();
  const [createBucketOpen, setCreateBucketOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [deleteBucketName, setDeleteBucketName] = useState<string | null>(null);
  const [deleteBucketConfirmValue, setDeleteBucketConfirmValue] = useState('');

  return (
    <Stack gap="md" data-testid="buckets-page">
      <PageHeader
        title={t('buckets.title')}
        subtitle={t('buckets.subtitle')}
        right={
          <Button onClick={() => setCreateBucketOpen(true)}>{t('buckets.createBucket')}</Button>
        }
      />

      <Alert title={t('buckets.publicAlertTitle')} variant="light">
        <Stack gap={4}>
          <Text size="sm">
            <strong>Allowed without login:</strong> HTTP GET (and HEAD) on a known full object URL.
          </Text>
          <Text size="sm">
            <strong>Never public:</strong> listing, upload, delete — always need credentials.
          </Text>
          <Text size="sm">
            <strong>Encrypted at rest:</strong> optional at bucket creation; public read cannot be enabled.
          </Text>
        </Stack>
      </Alert>

      <PageErrorAlert message={bucketsError} title={t('buckets.failedLoad')} />
      <PageErrorAlert message={error} />
      {msg ? (
        <Text size="sm" c="dimmed">
          {msg}
        </Text>
      ) : null}

      <CreateBucketDialog
        open={createBucketOpen}
        onOpenChange={setCreateBucketOpen}
        token={token}
        loadBuckets={loadBuckets}
      />

      {bucketsLoading ? (
        <TableSkeleton columns={4} />
      ) : (
        <Table withTableBorder striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Bucket</Table.Th>
              <Table.Th>Encrypted at rest</Table.Th>
              <Table.Th>Public read (GET by URL only)</Table.Th>
              <Table.Th ta="right">Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {buckets.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Group justify="center" gap="xs" py="lg">
                    <Text c="dimmed">{t('buckets.noBuckets')}</Text>
                    <Button variant="subtle" size="compact-sm" onClick={() => setCreateBucketOpen(true)}>
                      {t('buckets.createOne')}
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ) : (
              buckets.map((b) => (
                <Table.Tr key={b.name}>
                  <Table.Td>
                    <Text ff="monospace" size="sm">
                      {b.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {b.encryptAtRest ? (
                      <Badge variant="light">{t('buckets.encryptedYes')}</Badge>
                    ) : (
                      t('buckets.encryptedNo')
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="sm">
                      <Switch
                        checked={b.publicRead}
                        disabled={b.encryptAtRest || busy}
                        title={
                          b.encryptAtRest
                            ? 'Public read is not available for encrypted-at-rest buckets'
                            : undefined
                        }
                        onChange={async (e) => {
                          if (b.encryptAtRest) return;
                          const checked = e.currentTarget.checked;
                          setError('');
                          setMsg('');
                          try {
                            await admin.setBucketPublic(token, b.name, checked);
                            await loadBuckets();
                            setMsg(`Updated public read for ${b.name}`);
                          } catch (err) {
                            setError(String((err as Error).message || 'Update failed'));
                          }
                        }}
                      />
                      <Text size="xs" c="dimmed">
                        {b.publicRead ? t('buckets.publicOn') : t('buckets.publicOff')}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Button variant="subtle" color="red" size="compact-sm" onClick={() => setDeleteBucketName(b.name)}>
                      {t('buckets.deleteBucket')}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={!!deleteBucketName}
        onClose={() => {
          setDeleteBucketName(null);
          setDeleteBucketConfirmValue('');
        }}
        title={t('buckets.deleteTitle')}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t('buckets.deleteDescription')}
          </Text>
          <Text ff="monospace" size="xs" c="dimmed">
            {deleteBucketName}
          </Text>
          <Text size="xs" c="dimmed">
            {t('buckets.deleteConfirmHint')}
          </Text>
          <TextInput
            value={deleteBucketConfirmValue}
            onChange={(e) => setDeleteBucketConfirmValue(e.currentTarget.value)}
            placeholder={deleteBucketName ?? ''}
          />
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => {
                setDeleteBucketName(null);
                setDeleteBucketConfirmValue('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              disabled={busy || deleteBucketConfirmValue !== deleteBucketName}
              loading={busy}
              onClick={async () => {
                const target = deleteBucketName;
                setDeleteBucketName(null);
                setDeleteBucketConfirmValue('');
                if (!target) return;
                setBusy(true);
                setMsg('');
                setError('');
                try {
                  await admin.deleteBucketAdmin(token, target);
                  setMsg(`Deleted bucket ${target}`);
                  await loadBuckets();
                } catch (err) {
                  setError(String((err as Error).message || 'Delete failed'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
