
import * as admin from '@/api/admin';

import { Button, Group, Modal, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';

type CreateBucketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  loadBuckets: () => Promise<unknown>;
  /** Called after the bucket is created and the list refreshed. */
  onCreated?: (bucketName: string) => void;
};

/**
 * Modal form to create a new bucket (optional encryption at rest).
 */
export function CreateBucketDialog({
  open,
  onOpenChange,
  token,
  loadBuckets,
  onCreated,
}: CreateBucketDialogProps) {
  const [name, setName] = useState('');
  const [encryptAtRest, setEncryptAtRest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setEncryptAtRest(false);
      setErr('');
    }
  }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 3) return;
    setBusy(true);
    setErr('');
    try {
      await admin.createBucketAdmin(token, trimmed, encryptAtRest);
      await loadBuckets();
      onCreated?.(trimmed);
      onOpenChange(false);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={open} onClose={() => onOpenChange(false)} title="Create bucket">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Choose a unique bucket name (min. 3 characters). Encryption at rest can only be set now.
        </Text>
        <TextInput
          label="Bucket name"
          placeholder="new-bucket-name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          autoFocus
        />
        <Switch
          label="Encrypted at rest (disk)"
          checked={encryptAtRest}
          onChange={(e) => setEncryptAtRest(e.currentTarget.checked)}
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
          <Button disabled={busy || name.trim().length < 3} loading={busy} onClick={() => void submit()}>
            Create bucket
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
