
import type { BucketRow } from '@/context/auth-context';
import { useT } from '@/i18n/context';

import { Button, Card, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { NavLink } from 'react-router-dom';

type BrowserToolbarProps = {
  buckets: BucketRow[];
  fileBucket: string;
  onBucketChange: (name: string) => void;
  onCreateBucket: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  sortValue: string;
  onSortChange: (value: string) => void;
  busy: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelected: (file: File) => void;
};

/**
 * Bucket picker, search, sort, and upload controls for the object browser.
 */
export function BrowserToolbar({
  buckets,
  fileBucket,
  onBucketChange,
  onCreateBucket,
  onNewFolder,
  onRefresh,
  search,
  onSearchChange,
  sortValue,
  onSortChange,
  busy,
  fileInputRef,
  onFileSelected,
}: BrowserToolbarProps) {
  return (
    <Card withBorder padding="sm" mb="sm">
      <Group gap="sm" wrap="wrap" align="center">
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          Bucket
        </Text>
        <Select
          data={buckets.map((b) => ({
            value: b.name,
            label: `${b.name}${b.encryptAtRest ? ' (encrypted)' : ''}`,
          }))}
          value={fileBucket}
          onChange={(v) => v && onBucketChange(v)}
          w={220}
          size="sm"
        />
        <Button variant="default" size="sm" onClick={onCreateBucket}>
          Create bucket
        </Button>
        <div style={{ flex: 1, minWidth: 16 }} />
        <Button variant="default" size="sm" onClick={onNewFolder}>
          New folder
        </Button>
        <Button variant="default" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
        <TextInput
          size="sm"
          w={160}
          placeholder="Search object"
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
        />
        <Select
          size="sm"
          w={180}
          data={[
            { value: 'name:asc', label: 'Name A-Z' },
            { value: 'name:desc', label: 'Name Z-A' },
            { value: 'size:asc', label: 'Size asc' },
            { value: 'size:desc', label: 'Size desc' },
            { value: 'modified:desc', label: 'Newest first' },
            { value: 'modified:asc', label: 'Oldest first' },
          ]}
          value={sortValue}
          onChange={(v) => v && onSortChange(v)}
        />
        {/* Native file picker — Mantine has no hidden file input primitive */}
        {/* eslint-disable-next-line no-restricted-syntax -- file upload requires native input */}
        <input
          ref={fileInputRef}
          type="file"
          hidden
          disabled={busy || !fileBucket}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f || !fileBucket) return;
            onFileSelected(f);
          }}
        />
        <Button size="sm" disabled={busy || !fileBucket} onClick={() => fileInputRef.current?.click()}>
          Upload file
        </Button>
      </Group>
    </Card>
  );
}

type BrowserEmptyBucketsProps = {
  msg: string;
  bucketsError?: string;
  bucketsLoading?: boolean;
  onCreateBucket: () => void;
};

/**
 * Shown when no buckets exist yet.
 */
export function BrowserEmptyBuckets({
  msg,
  bucketsError,
  bucketsLoading,
  onCreateBucket,
}: BrowserEmptyBucketsProps) {
  const t = useT();

  return (
    <Card withBorder padding="lg">
      <Stack gap="md">
        {bucketsLoading ? (
          <Text size="sm" c="dimmed">
            {t('browser.loadingBuckets')}
          </Text>
        ) : bucketsError ? (
          <Text size="sm" c="red">
            {bucketsError}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            {t('browser.noBuckets')}
          </Text>
        )}
        <Group gap="sm">
          <Button onClick={onCreateBucket}>Create bucket</Button>
          <Text c="dimmed">or</Text>
          <Button variant="subtle" component={NavLink} to="/app/buckets">
            {t('browser.goToBuckets')}
          </Button>
        </Group>
        {msg ? (
          <Text size="sm" c="dimmed">
            {msg}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
