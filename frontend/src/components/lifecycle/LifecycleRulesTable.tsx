
import type { LifecycleRule } from '@/api/admin';
import { LifecycleRuleDialog } from '@/components/lifecycle/LifecycleRuleDialog';

import { Badge, Button, Group, Table, Text } from '@mantine/core';
import { useState } from 'react';

type LifecycleRulesTableProps = {
  rules: LifecycleRule[];
  disabled?: boolean;
  onChange: (rules: LifecycleRule[]) => void;
};

/**
 * Editable table of lifecycle rules with add/edit/remove actions.
 */
export function LifecycleRulesTable({ rules, disabled, onChange }: LifecycleRulesTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LifecycleRule | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (rule: LifecycleRule) => {
    setEditing(rule);
    setDialogOpen(true);
  };

  const saveRule = (rule: LifecycleRule) => {
    if (editing) {
      onChange(rules.map((r) => (r.id === editing.id ? rule : r)));
      return;
    }
    onChange([...rules, rule]);
  };

  return (
    <>
      <Group justify="flex-end" mb="sm">
        <Button size="sm" disabled={disabled} onClick={openAdd}>
          Add rule
        </Button>
      </Group>
      <Table withTableBorder striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Prefix</Table.Th>
            <Table.Th>Expire (days)</Table.Th>
            <Table.Th>Abort multipart (days)</Table.Th>
            <Table.Th ta="right">Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rules.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text c="dimmed" ta="center" py="md">
                  No lifecycle rules for this bucket.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            rules.map((rule) => (
              <Table.Tr key={rule.id}>
                <Table.Td>
                  <Text ff="monospace" size="xs">
                    {rule.id}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {rule.enabled ? (
                    <Badge variant="light">Enabled</Badge>
                  ) : (
                    <Badge color="gray">Disabled</Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text ff="monospace" size="xs" c="dimmed">
                    {rule.prefix || '—'}
                  </Text>
                </Table.Td>
                <Table.Td>{rule.expirationDays ?? '—'}</Table.Td>
                <Table.Td>{rule.abortMultipartAfterDays ?? '—'}</Table.Td>
                <Table.Td ta="right">
                  <Group justify="flex-end" gap="xs">
                    <Button variant="subtle" size="compact-sm" disabled={disabled} onClick={() => openEdit(rule)}>
                      Edit
                    </Button>
                    <Button
                      variant="subtle"
                      color="red"
                      size="compact-sm"
                      disabled={disabled}
                      onClick={() => onChange(rules.filter((r) => r.id !== rule.id))}
                    >
                      Remove
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
      <LifecycleRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        existingIds={rules.map((r) => r.id)}
        onSave={saveRule}
      />
    </>
  );
}
