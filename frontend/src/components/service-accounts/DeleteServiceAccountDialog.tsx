
import type { ServiceAccountRow } from '@/api/admin';

import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';

type DeleteServiceAccountDialogProps = {
  target: ServiceAccountRow | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: number) => Promise<void>;
};

/**
 * Confirms permanent deletion of a service account by typing the access key.
 */
export function DeleteServiceAccountDialog({
  target,
  busy,
  onOpenChange,
  onConfirm,
}: DeleteServiceAccountDialogProps) {
  const [confirm, setConfirm] = useState('');

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onOpenChange(false);
      setConfirm('');
    }
  };

  return (
    <Modal opened={!!target} onClose={() => handleOpenChange(false)} title="Delete service account?">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          This permanently removes the key pair.
        </Text>
        {target ? (
          <Text ff="monospace" size="xs" c="dimmed">
            {target.accessKey}
          </Text>
        ) : null}
        <Text size="xs" c="dimmed">
          Type the access key to confirm.
        </Text>
        <TextInput
          value={confirm}
          onChange={(e) => setConfirm(e.currentTarget.value)}
          placeholder={target?.accessKey ?? ''}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={busy || !target || confirm !== target.accessKey}
            loading={busy}
            onClick={async () => {
              if (!target) return;
              await onConfirm(target.id);
              setConfirm('');
            }}
          >
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
