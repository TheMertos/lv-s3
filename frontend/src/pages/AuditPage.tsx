import * as admin from '@/api/admin';
import { PageErrorAlert } from '@/components/common/PageErrorAlert';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/context/auth-context';
import { useT } from '@/i18n/context';
import { formatDate } from '@/lib/format';

import {
  Button,
  Group,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 25;

/**
 * Paginated audit log table with optional filters.
 */
export function AuditPage() {
  const t = useT();
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [actorName, setActorName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ action: '', actorName: '', from: '', to: '' });
  const [data, setData] = useState<admin.AuditListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadAudit = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const result = await admin.listAuditLogs(token, {
        page,
        pageSize: PAGE_SIZE,
        action: applied.action || undefined,
        actorName: applied.actorName || undefined,
        from: applied.from || undefined,
        to: applied.to || undefined,
      });
      setData(result);
    } catch (e) {
      setData(null);
      setError(String((e as Error).message || t('audit.failedLoad')));
    } finally {
      setLoading(false);
    }
  }, [token, page, applied, t]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Stack gap="md" data-testid="audit-page">
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />

      <Group align="flex-end" wrap="wrap" gap="sm">
        <TextInput
          label={t('audit.filterAction')}
          value={action}
          onChange={(e) => setAction(e.currentTarget.value)}
          w={180}
        />
        <TextInput
          label={t('audit.filterActor')}
          value={actorName}
          onChange={(e) => setActorName(e.currentTarget.value)}
          w={180}
        />
        <TextInput
          label={t('audit.from')}
          type="datetime-local"
          value={from}
          onChange={(e) => setFrom(e.currentTarget.value)}
          w={200}
        />
        <TextInput
          label={t('audit.to')}
          type="datetime-local"
          value={to}
          onChange={(e) => setTo(e.currentTarget.value)}
          w={200}
        />
        <Button
          onClick={() => {
            setPage(1);
            setApplied({ action, actorName, from, to });
          }}
        >
          {t('audit.applyFilters')}
        </Button>
        <Button
          variant="default"
          onClick={() => {
            setAction('');
            setActorName('');
            setFrom('');
            setTo('');
            setPage(1);
            setApplied({ action: '', actorName: '', from: '', to: '' });
          }}
        >
          {t('audit.clearFilters')}
        </Button>
      </Group>

      <PageErrorAlert message={error} title={t('audit.failedLoad')} />

      {loading ? (
        <TableSkeleton columns={6} />
      ) : (
        <>
          <Table withTableBorder striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('audit.createdAt')}</Table.Th>
                <Table.Th>{t('audit.action')}</Table.Th>
                <Table.Th>{t('audit.actor')}</Table.Th>
                <Table.Th>{t('audit.resource')}</Table.Th>
                <Table.Th>{t('audit.ip')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {!data?.items.length ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" ta="center" py="lg">
                      {t('audit.noEntries')}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                data.items.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>{formatDate(row.createdAt)}</Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {row.action}
                      </Text>
                    </Table.Td>
                    <Table.Td>{row.actorName ?? row.actorType}</Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {row.resourceType ? `${row.resourceType}${row.resourceId ? `: ${row.resourceId}` : ''}` : '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>{row.ip ?? '—'}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>

          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              {t('audit.page')} {page} {t('audit.of')} {pageCount} · {data?.total ?? 0} {t('audit.total')}
            </Text>
            <Pagination value={page} onChange={setPage} total={pageCount} />
          </Group>
        </>
      )}
    </Stack>
  );
}
