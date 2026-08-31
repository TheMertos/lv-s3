import { Button, Group, Modal, Stack, Text } from '@mantine/core';

type DisableServiceAccountDialogProps = {
  accountId: number | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: number) => Promise<void>;
};

/**
 * Confirms disabling a service account.
 */
export function DisableServiceAccountDialog({
  accountId,
  busy,
  onOpenChange,
  onConfirm,
}: DisableServiceAccountDialogProps) {
  return (
    <Modal opened={accountId !== null} onClose={() => onOpenChange(false)} title="Disable service account?">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          This key will stop working for S3 API calls. This cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={busy}
            disabled={accountId === null}
            onClick={async () => {
              if (accountId === null) return;
              await onConfirm(accountId);
            }}
          >
            Disable
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
