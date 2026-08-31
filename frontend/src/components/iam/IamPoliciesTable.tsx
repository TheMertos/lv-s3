import type { IamPolicyRow } from '@/api/admin';
import { useT } from '@/i18n/context';

import { Badge, Button, Group, Table, Text } from '@mantine/core';

type IamPoliciesTableProps = {
  rows: IamPolicyRow[];
  onCreate: () => void;
  onEdit: (row: IamPolicyRow) => void;
  onDelete: (row: IamPolicyRow) => void;
};

/**
 * Lists IAM policies with statement counts and row actions.
 */
export function IamPoliciesTable({ rows, onCreate, onEdit, onDelete }: IamPoliciesTableProps) {
  const t = useT();

  return (
    <Table withTableBorder striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('iamPolicies.colName')}</Table.Th>
          <Table.Th>{t('iamPolicies.colStatements')}</Table.Th>
          <Table.Th>{t('iamPolicies.colUpdated')}</Table.Th>
          <Table.Th ta="right">{t('iamPolicies.colActions')}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.length === 0 ? (
          <Table.Tr>
            <Table.Td colSpan={4}>
              <Group justify="center" gap="xs" py="lg">
                <Text c="dimmed">{t('iamPolicies.noPolicies')}</Text>
                <Button variant="subtle" size="compact-sm" onClick={onCreate}>
                  {t('iamPolicies.createOne')}
                </Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        ) : (
          rows.map((r) => {
            const statementCount = Array.isArray(r.document?.Statement)
              ? r.document.Statement.length
              : 0;
            return (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <Text fw={500} size="sm">
                    {r.name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{statementCount}</Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {new Date(r.updatedAt).toLocaleString()}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Group justify="flex-end" gap="xs">
                    <Button variant="subtle" size="compact-sm" onClick={() => onEdit(r)}>
                      {t('common.edit')}
                    </Button>
                    <Button variant="subtle" color="red" size="compact-sm" onClick={() => onDelete(r)}>
                      {t('common.delete')}
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
