import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';

type BrowserFooterProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  selectedCount: number;
  busy: boolean;
  onDeleteSelected: () => void;
};

/**
 * Pagination and bulk-delete controls below the object table.
 */
export function BrowserFooter({
  page,
  pageCount,
  onPageChange,
  selectedCount,
  busy,
  onDeleteSelected,
}: BrowserFooterProps) {
  return (
    <Group justify="space-between" mt="sm" gap="sm" wrap="wrap">
      <Group gap="xs">
        <Text size="xs" c="dimmed">
          Page {page} / {pageCount}
        </Text>
        <Button variant="subtle" size="compact-xs" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
          Prev
        </Button>
        <Button
          variant="subtle"
          size="compact-xs"
          disabled={page >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        >
          Next
        </Button>
      </Group>
      <Group gap="xs">
        <Text size="xs" c="dimmed">
          {selectedCount} selected
        </Text>
        <Button
          variant="subtle"
          color="red"
          size="compact-xs"
          disabled={selectedCount === 0 || busy}
          onClick={onDeleteSelected}
        >
          Delete selected
        </Button>
      </Group>
    </Group>
  );
}

type BrowserNewFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileBucket: string;
  prefix: string;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  busy: boolean;
  onSubmit: () => void;
};

/**
 * Modal to create a new folder under the current prefix.
 */
export function BrowserNewFolderDialog({
  open,
  onOpenChange,
  fileBucket,
  prefix,
  newFolderName,
  onNewFolderNameChange,
  busy,
  onSubmit,
}: BrowserNewFolderDialogProps) {
  return (
    <Modal opened={open} onClose={() => onOpenChange(false)} title="New folder">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {prefix ? `Create in ${fileBucket}/${prefix}` : `Create in ${fileBucket}`}
        </Text>
        <TextInput
          placeholder="folder-name"
          value={newFolderName}
          onChange={(e) => onNewFolderNameChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (newFolderName.trim()) onSubmit();
            }
          }}
        />
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              onOpenChange(false);
              onNewFolderNameChange('');
            }}
          >
            Cancel
          </Button>
          <Button disabled={busy || !newFolderName.trim()} loading={busy} onClick={onSubmit}>
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

type BrowserDeleteFolderDialogProps = {
  folderPath: string | null;
  fileBucket: string;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/**
 * Confirms deletion of an empty folder.
 */
export function BrowserDeleteFolderDialog({
  folderPath,
  fileBucket,
  busy,
  onOpenChange,
  onConfirm,
}: BrowserDeleteFolderDialogProps) {
  return (
    <Modal opened={!!folderPath} onClose={() => onOpenChange(false)} title="Delete folder?">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Only empty folders can be removed (no files, no subfolders).
        </Text>
        <Text ff="monospace" size="xs" c="dimmed">
          {fileBucket}/{folderPath}/
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button color="red" loading={busy} onClick={onConfirm}>
            Delete folder
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

type BrowserDeleteObjectDialogProps = {
  deleteKey: string | null;
  confirmValue: string;
  onConfirmValueChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/**
 * Confirms object deletion by typing the full key.
 */
export function BrowserDeleteObjectDialog({
  deleteKey,
  confirmValue,
  onConfirmValueChange,
  onOpenChange,
  onConfirm,
}: BrowserDeleteObjectDialogProps) {
  return (
    <Modal
      opened={!!deleteKey}
      onClose={() => onOpenChange(false)}
      title="Delete object?"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Type the full key to confirm.
        </Text>
        <Text ff="monospace" size="xs" c="dimmed">
          {deleteKey}
        </Text>
        <TextInput
          value={confirmValue}
          onChange={(e) => onConfirmValueChange(e.currentTarget.value)}
          placeholder={deleteKey ?? ''}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button color="red" disabled={confirmValue !== deleteKey} onClick={onConfirm}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
