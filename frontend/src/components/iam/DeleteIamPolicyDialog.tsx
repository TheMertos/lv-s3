import type { IamPolicyRow } from '@/api/admin';
import { useT } from '@/i18n/context';

import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';

type DeleteIamPolicyDialogProps = {
  target: IamPolicyRow | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: number) => Promise<void>;
};

/**
 * Confirms permanent deletion of an IAM policy by typing its name.
 */
export function DeleteIamPolicyDialog({
  target,
  busy,
  onOpenChange,
  onConfirm,
}: DeleteIamPolicyDialogProps) {
  const t = useT();
  const [confirm, setConfirm] = useState('');

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onOpenChange(false);
      setConfirm('');
    }
  };

  return (
    <Modal
      opened={!!target}
      onClose={() => handleOpenChange(false)}
      title={t('iamPolicies.deleteTitle')}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('iamPolicies.deleteDescription')}
        </Text>
        {target ? (
          <Text ff="monospace" size="sm" fw={500}>
            {target.name}
          </Text>
        ) : null}
        <Text size="xs" c="dimmed">
          {t('iamPolicies.deleteConfirmHint')}
        </Text>
        <TextInput
          value={confirm}
          onChange={(e) => setConfirm(e.currentTarget.value)}
          placeholder={target?.name ?? ''}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            color="red"
            disabled={busy || !target || confirm !== target.name}
            loading={busy}
            onClick={async () => {
              if (!target) return;
              await onConfirm(target.id);
              setConfirm('');
            }}
          >
            {t('common.delete')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
