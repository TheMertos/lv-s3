
import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';

type CreateServiceAccountDialogProps = {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (label: string) => Promise<void>;
};

/**
 * Modal form to create a new S3 service account.
 */
export function CreateServiceAccountDialog({
  open,
  busy,
  onOpenChange,
  onCreate,
}: CreateServiceAccountDialogProps) {
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setLabel('');
      setErr('');
    }
    onOpenChange(next);
  };

  return (
    <Modal
      opened={open}
      onClose={() => handleOpenChange(false)}
      title="Create service account"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Optional label helps you remember what uses this key.
        </Text>
        <TextInput
          label="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          placeholder="e.g. CI backup job"
          maxLength={255}
        />
        {err ? (
          <Text size="sm" c="red">
            {err}
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setErr('');
              try {
                await onCreate(label);
              } catch (e) {
                setErr(String((e as Error).message));
              }
            }}
          >
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
