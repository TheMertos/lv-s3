
import type * as admin from '@/api/admin';
import { formatDate, formatSize } from '@/lib/format';
import { publicObjectUrl } from '@/lib/s3-public-base';

import { Button, Checkbox, Group, Stack, Table, Text } from '@mantine/core';
import { IconFile, IconFolder, IconFolderUp } from '@tabler/icons-react';

type BrowserObjectTableProps = {
  fileBucket: string;
  prefix: string;
  onPrefixChange: (prefix: string) => void;
  browse: admin.BrowseResult | null;
  err: string;
  bucketPublic: boolean;
  busy: boolean;
  pageItems: { key: string; size: number; lastModified: string }[];
  selectedKeys: string[];
  onSelectedKeysChange: (keys: string[]) => void;
  headerChecked: boolean | 'indeterminate';
  dragTargetPrefix: string | null;
  onDragTargetPrefixChange: (prefix: string | null) => void;
  onDragActiveChange: (active: boolean) => void;
  onUploadToPrefix: (files: File[], targetPrefix: string) => Promise<void>;
  onDeleteFolder: (folderPath: string) => void;
  onDeleteObject: (key: string) => void;
  onDownload: (key: string, name: string) => void;
  onCopyPublicUrl: (key: string) => void;
  bucketsCount: number;
  isTruncated?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

/**
 * Object browser table: parent row, folder prefixes, and file objects.
 */
export function BrowserObjectTable({
  fileBucket,
  prefix,
  onPrefixChange,
  browse,
  err,
  bucketPublic,
  busy,
  pageItems,
  selectedKeys,
  onSelectedKeysChange,
  headerChecked,
  dragTargetPrefix,
  onDragTargetPrefixChange,
  onDragActiveChange,
  onUploadToPrefix,
  onDeleteFolder,
  onDeleteObject,
  onDownload,
  onCopyPublicUrl,
  bucketsCount,
  isTruncated,
  loadingMore,
  onLoadMore,
}: BrowserObjectTableProps) {
  return (
    <Stack gap="sm">
      <Table withTableBorder striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={40}>
              <Checkbox
                checked={headerChecked === true}
                indeterminate={headerChecked === 'indeterminate'}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  if (on) {
                    onSelectedKeysChange(
                      Array.from(new Set([...selectedKeys, ...pageItems.map((o) => o.key)])),
                    );
                  } else {
                    onSelectedKeysChange(selectedKeys.filter((k) => !pageItems.some((o) => o.key === k)));
                  }
                }}
                aria-label="Select page"
              />
            </Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>Last modified</Table.Th>
            <Table.Th>Size</Table.Th>
            <Table.Th ta="right">Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {prefix ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Button
                  variant="subtle"
                  size="compact-sm"
                  leftSection={<IconFolderUp size={16} />}
                  onClick={() => {
                    const parts = prefix.replace(/\/$/, '').split('/');
                    parts.pop();
                    onPrefixChange(parts.length ? `${parts.join('/')}/` : '');
                  }}
                >
                  .. (parent)
                </Button>
              </Table.Td>
            </Table.Tr>
          ) : null}
          {(browse?.prefixes || []).map((p: string) => {
            const name = p.replace(prefix, '').replace(/\/$/, '') || p;
            const folderKey = p.replace(/\/$/, '');
            return (
              <Table.Tr
                key={p}
                style={{ background: dragTargetPrefix === p ? 'var(--mantine-color-default)' : undefined }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDragTargetPrefixChange(p);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDragTargetPrefixChange(dragTargetPrefix === p ? null : dragTargetPrefix);
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDragActiveChange(false);
                  onDragTargetPrefixChange(null);
                  const dropped = Array.from(e.dataTransfer.files || []);
                  if (!dropped.length) return;
                  await onUploadToPrefix(dropped, p);
                }}
              >
                <Table.Td />
                <Table.Td>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<IconFolder size={16} />}
                    onClick={() => onPrefixChange(p)}
                    title={name}
                  >
                    <Text ff="monospace" size="sm" truncate maw={320}>
                      {name}/
                    </Text>
                  </Button>
                </Table.Td>
                <Table.Td c="dimmed">
                  —
                </Table.Td>
                <Table.Td c="dimmed">
                  —
                </Table.Td>
                <Table.Td ta="right">
                  <Button variant="subtle" color="red" size="compact-sm" onClick={() => onDeleteFolder(folderKey)}>
                    Delete
                  </Button>
                </Table.Td>
              </Table.Tr>
            );
          })}
          {pageItems.map((o) => {
            const name = o.key.startsWith(prefix) ? o.key.slice(prefix.length) : o.key;
            const url = publicObjectUrl(fileBucket, o.key);
            return (
              <Table.Tr key={o.key}>
                <Table.Td>
                  <Checkbox
                    checked={selectedKeys.includes(o.key)}
                    onChange={(e) => {
                      if (e.currentTarget.checked) {
                        onSelectedKeysChange([...selectedKeys, o.key]);
                      } else {
                        onSelectedKeysChange(selectedKeys.filter((k) => k !== o.key));
                      }
                    }}
                    aria-label={`Select ${name}`}
                  />
                </Table.Td>
                <Table.Td maw={360}>
                  <Group gap="xs" wrap="nowrap">
                    <IconFile size={16} />
                    <Text ff="monospace" size="sm" truncate title={o.key}>
                      {name}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {formatDate(o.lastModified)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {formatSize(o.size)}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Group gap="xs" justify="flex-end" wrap="nowrap">
                    <Button variant="subtle" size="compact-sm" disabled={busy} onClick={() => onDownload(o.key, name)}>
                      Download
                    </Button>
                    {bucketPublic && url ? (
                      <Button variant="subtle" size="compact-sm" onClick={() => onCopyPublicUrl(o.key)}>
                        Copy URL
                      </Button>
                    ) : null}
                    <Button variant="subtle" color="red" size="compact-sm" onClick={() => onDeleteObject(o.key)}>
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
          {bucketsCount === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text c="dimmed" ta="center" py="lg">
                  No buckets — create one in the toolbar or under Buckets.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : !browse?.prefixes?.length && !browse?.objects?.length && !err ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text c="dimmed" ta="center" py="lg">
                  This folder is empty
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : null}
        </Table.Tbody>
      </Table>
      {isTruncated && onLoadMore ? (
        <Group justify="center">
          <Button variant="default" loading={loadingMore} onClick={onLoadMore}>
            Load more
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}
