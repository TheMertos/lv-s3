import type { ServiceAccountCreated } from '@/api/admin';

import { Button, Group, Modal, Stack, Text } from '@mantine/core';

type CreatedCredentialsDialogProps = {
  created: ServiceAccountCreated | null;
  onClose: () => void;
};

/**
 * One-time display of access key and secret after service account creation.
 */
export function CreatedCredentialsDialog({ created, onClose }: CreatedCredentialsDialogProps) {
  return (
    <Modal opened={!!created} onClose={onClose} title="Save these credentials" size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          The secret key is shown only once. Copy it now; you cannot view it again from this console.
        </Text>
        {created ? (
          <Stack gap="md">
            <div>
              <Text size="xs" fw={600} c="dimmed">
                Access key
              </Text>
              <Text ff="monospace" size="xs">
                {created.accessKey}
              </Text>
              <Button
                variant="default"
                size="xs"
                mt="xs"
                onClick={() => void navigator.clipboard.writeText(created.accessKey)}
              >
                Copy access key
              </Button>
            </div>
            <div>
              <Text size="xs" fw={600} c="dimmed">
                Secret key
              </Text>
              <Text ff="monospace" size="xs">
                {created.secretKey}
              </Text>
              <Button
                variant="default"
                size="xs"
                mt="xs"
                onClick={() => void navigator.clipboard.writeText(created.secretKey)}
              >
                Copy secret key
              </Button>
            </div>
          </Stack>
        ) : null}
        <Group justify="flex-end">
          <Button onClick={onClose}>Done</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
