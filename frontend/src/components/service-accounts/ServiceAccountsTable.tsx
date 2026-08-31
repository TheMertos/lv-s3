import type { IamPolicyRow, ServiceAccountRow } from '@/api/admin';
import { useT } from '@/i18n/context';

import { ActionIcon, Badge, Button, Group, Table, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';

type ServiceAccountsTableProps = {
  rows: ServiceAccountRow[];
  policiesByAccountId: Record<number, IamPolicyRow[]>;
  loading?: boolean;
  busy?: boolean;
  onCreate: () => void;
  onDisable: (id: number) => void;
  onDelete: (row: ServiceAccountRow) => void;
  onAttachPolicy: (row: ServiceAccountRow) => void;
  onDetachPolicy: (serviceAccountId: number, policyId: number) => void;
};

/**
 * Lists service accounts with attached IAM policies and row actions.
 */
export function ServiceAccountsTable({
  rows,
  policiesByAccountId,
  loading,
  busy,
  onCreate,
  onDisable,
  onDelete,
  onAttachPolicy,
  onDetachPolicy,
}: ServiceAccountsTableProps) {
  const t = useT();

  return (
    <Table withTableBorder striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Access key</Table.Th>
          <Table.Th>Label</Table.Th>
          <Table.Th>{t('serviceAccounts.colPolicies')}</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Created</Table.Th>
          <Table.Th ta="right">Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {loading ? (
          <Table.Tr>
            <Table.Td colSpan={6}>
              <Text c="dimmed" ta="center" py="lg">
                Loading…
              </Text>
            </Table.Td>
          </Table.Tr>
        ) : rows.length === 0 ? (
          <Table.Tr>
            <Table.Td colSpan={6}>
              <Group justify="center" gap="xs" py="lg">
                <Text c="dimmed">No service accounts yet.</Text>
                <Button variant="subtle" size="compact-sm" onClick={onCreate}>
                  Create one
                </Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        ) : (
          rows.map((r) => {
            const attached = policiesByAccountId[r.id] ?? [];
            return (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <Text ff="monospace" size="xs" truncate maw={220}>
                    {r.accessKey}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {typeof r.label === 'string' ? r.label : '—'}
                  </Text>
                </Table.Td>
                <Table.Td maw={280}>
                  <Group gap={4} wrap="wrap">
                    {attached.length === 0 ? (
                      <Text size="xs" c="dimmed">
                        {t('serviceAccounts.noPoliciesAttached')}
                      </Text>
                    ) : (
                      attached.map((policy) => (
                        <Badge
                          key={policy.id}
                          variant="light"
                          size="sm"
                          rightSection={
                            <ActionIcon
                              size="xs"
                              variant="transparent"
                              color="gray"
                              aria-label={t('serviceAccounts.detachPolicy')}
                              disabled={busy}
                              onClick={() => onDetachPolicy(r.id, policy.id)}
                            >
                              <IconX size={12} />
                            </ActionIcon>
                          }
                        >
                          {policy.name}
                        </Badge>
                      ))
                    )}
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      disabled={busy}
                      onClick={() => onAttachPolicy(r)}
                    >
                      {t('serviceAccounts.attachPolicy')}
                    </Button>
                  </Group>
                </Table.Td>
                <Table.Td>
                  {r.disabled ? (
                    <Badge color="gray">Disabled</Badge>
                  ) : (
                    <Badge variant="light">Active</Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {new Date(r.createdAt).toLocaleString()}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Group justify="flex-end" gap="xs">
                    {!r.disabled ? (
                      <Button variant="subtle" size="compact-sm" onClick={() => onDisable(r.id)}>
                        Disable
                      </Button>
                    ) : null}
                    <Button variant="subtle" color="red" size="compact-sm" onClick={() => onDelete(r)}>
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })
        )}
      </Table.Tbody>
    </Table>
  );
}
