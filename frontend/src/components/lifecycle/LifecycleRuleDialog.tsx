import type { LifecycleRule } from '@/api/admin';

import { Button, Group, Modal, NumberInput, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useState } from 'react';

type LifecycleRuleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: LifecycleRule | null;
  existingIds: string[];
  onSave: (rule: LifecycleRule) => void;
};

const emptyRule = (): LifecycleRule => ({
  id: '',
  enabled: true,
  prefix: '',
  expirationDays: undefined,
  abortMultipartAfterDays: undefined,
});

type LifecycleRuleFormProps = {
  initial?: LifecycleRule | null;
  existingIds: string[];
  onSave: (rule: LifecycleRule) => void;
  onCancel: () => void;
};

/**
 * Inner form remounted when dialog opens for a different rule.
 */
function LifecycleRuleForm({ initial, existingIds, onSave, onCancel }: LifecycleRuleFormProps) {
  const [rule, setRule] = useState<LifecycleRule>(() =>
    initial ? { ...initial } : emptyRule(),
  );
  const [err, setErr] = useState('');

  const submit = () => {
    const id = rule.id.trim();
    if (!id) {
      setErr('Rule ID is required');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
      setErr('ID may only contain letters, numbers, dot, underscore, hyphen');
      return;
    }
    if (!initial && existingIds.includes(id)) {
      setErr('Rule ID must be unique');
      return;
    }
    if (!rule.expirationDays && !rule.abortMultipartAfterDays) {
      setErr('Set expiration days and/or abort multipart days');
      return;
    }
    onSave({
      id,
      enabled: rule.enabled,
      prefix: rule.prefix?.trim() || undefined,
      expirationDays: rule.expirationDays ? Number(rule.expirationDays) : undefined,
      abortMultipartAfterDays: rule.abortMultipartAfterDays
        ? Number(rule.abortMultipartAfterDays)
        : undefined,
    });
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Rules run automatically in the background. Each rule needs at least one action.
      </Text>
      <TextInput
        label="Rule ID"
        value={rule.id}
        disabled={!!initial}
        onChange={(e) => setRule((r) => ({ ...r, id: e.currentTarget.value }))}
        placeholder="expire-logs"
      />
      <Switch
        label="Enabled"
        checked={rule.enabled}
        onChange={(e) => setRule((r) => ({ ...r, enabled: e.currentTarget.checked }))}
      />
      <TextInput
        label="Key prefix (optional)"
        value={rule.prefix ?? ''}
        onChange={(e) => setRule((r) => ({ ...r, prefix: e.currentTarget.value }))}
        placeholder="logs/"
      />
      <NumberInput
        label="Expire objects after (days)"
        min={1}
        max={3650}
        value={rule.expirationDays ?? ''}
        onChange={(v) =>
          setRule((r) => ({
            ...r,
            expirationDays: typeof v === 'number' ? v : undefined,
          }))
        }
        placeholder="e.g. 30"
      />
      <NumberInput
        label="Abort multipart uploads after (days)"
        min={1}
        max={3650}
        value={rule.abortMultipartAfterDays ?? ''}
        onChange={(v) =>
          setRule((r) => ({
            ...r,
            abortMultipartAfterDays: typeof v === 'number' ? v : undefined,
          }))
        }
        placeholder="e.g. 7"
      />
      {err ? (
        <Text size="sm" c="red">
          {err}
        </Text>
      ) : null}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={submit}>{initial ? 'Update' : 'Add'}</Button>
      </Group>
    </Stack>
  );
}

/**
 * Modal to add or edit a single lifecycle rule.
 */
export function LifecycleRuleDialog({
  open,
  onOpenChange,
  initial,
  existingIds,
  onSave,
}: LifecycleRuleDialogProps) {
  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title={initial ? 'Edit rule' : 'Add lifecycle rule'}
    >
      {open ? (
        <LifecycleRuleForm
          key={initial?.id ?? 'new'}
          initial={initial}
          existingIds={existingIds}
          onSave={(rule) => {
            onSave(rule);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      ) : null}
    </Modal>
  );
}
