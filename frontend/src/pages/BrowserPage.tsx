import {
  BrowserDeleteFolderDialog,
  BrowserDeleteObjectDialog,
  BrowserFooter,
  BrowserNewFolderDialog,
} from '@/components/browser/BrowserDialogs';
import { BrowserObjectTable } from '@/components/browser/BrowserObjectTable';
import { BrowserEmptyBuckets, BrowserToolbar } from '@/components/browser/BrowserToolbar';
import { CreateBucketDialog } from '@/components/buckets/CreateBucketDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { useObjectBrowser } from '@/hooks/use-object-browser';
import { useT } from '@/i18n/context';

import { Alert, Box, Stack, Text } from '@mantine/core';

/**
 * Object browser: bucket picker, toolbar, dense table.
 */
export function BrowserPage() {
  const t = useT();
  const b = useObjectBrowser();

  return (
    <Box
      pos="relative"
      data-testid="browser-page"
      onDragOver={
        b.hasBuckets
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!b.dragActive) b.setDragActive(true);
            }
          : undefined
      }
      onDragLeave={
        b.hasBuckets
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              b.setDragActive(false);
            }
          : undefined
      }
      onDrop={b.hasBuckets ? (e) => void b.handlePageDrop(e) : undefined}
      style={
        b.hasBuckets && b.dragActive
          ? { outline: '2px solid var(--mantine-color-lv-5)', outlineOffset: 4 }
          : undefined
      }
    >
      <PageHeader title={t('browser.title')} subtitle={t('browser.subtitle')} />

      {!b.hasBuckets ? (
        <BrowserEmptyBuckets
          msg={b.msg}
          bucketsError={b.bucketsError}
          bucketsLoading={b.bucketsLoading}
          onCreateBucket={() => b.setCreateBucketOpen(true)}
        />
      ) : (
        <Stack gap="sm">
          <BrowserToolbar
            buckets={b.buckets}
            fileBucket={b.fileBucket}
            onBucketChange={(v) => {
              b.setFileBucket(v);
              b.setPrefix('');
            }}
            onCreateBucket={() => b.setCreateBucketOpen(true)}
            onNewFolder={() => {
              b.setNewFolderName('');
              b.setNewFolderModalOpen(true);
            }}
            onRefresh={() => void b.refreshList()}
            search={b.search}
            onSearchChange={(value) => {
              b.setSearch(value);
              b.setPage(1);
            }}
            sortValue={b.sortValue}
            onSortChange={b.setSortValue}
            busy={b.busy}
            fileInputRef={b.fileInputRef}
            onFileSelected={(f) => void b.uploadFilesToPrefix([f], b.prefix)}
          />

          {b.dragActive ? (
            <Box
              pos="absolute"
              inset={0}
              style={{
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--mantine-radius-md)',
                border: '2px dashed var(--mantine-color-lv-4)',
                background: 'color-mix(in srgb, var(--mantine-color-body) 82%, var(--mantine-color-lv-9))',
                pointerEvents: 'none',
              }}
            >
              <Text size="sm" fw={500}>
                Drop files to upload into current folder
              </Text>
            </Box>
          ) : null}

          {b.bucketPublic ? (
            <Alert variant="light">
              Public bucket: anonymous users may <strong>GET</strong> exact object URLs only — listing is never public.
            </Alert>
          ) : null}

          {b.err ? (
            <Text size="sm" c="red">
              {b.err}
            </Text>
          ) : null}
          {b.msg ? (
            <Text size="xs" c="dimmed">
              {b.msg}
            </Text>
          ) : null}

          <BrowserObjectTable
            fileBucket={b.fileBucket}
            prefix={b.prefix}
            onPrefixChange={b.setPrefix}
            browse={b.browse}
            err={b.err}
            bucketPublic={b.bucketPublic}
            busy={b.busy}
            pageItems={b.pageItems}
            selectedKeys={b.selectedKeys}
            onSelectedKeysChange={b.setSelectedKeys}
            headerChecked={b.headerChecked}
            dragTargetPrefix={b.dragTargetPrefix}
            onDragTargetPrefixChange={b.setDragTargetPrefix}
            onDragActiveChange={b.setDragActive}
            onUploadToPrefix={b.uploadFilesToPrefix}
            onDeleteFolder={b.setDeleteFolderPath}
            onDeleteObject={b.setDeleteKey}
            onDownload={(key, name) => void b.downloadObject(key, name)}
            onCopyPublicUrl={b.copyPublicUrl}
            bucketsCount={b.buckets.length}
            isTruncated={b.browse?.isTruncated}
            loadingMore={b.loadingMore}
            onLoadMore={() => void b.loadMore()}
          />

          <BrowserFooter
            page={b.page}
            pageCount={b.pageCount}
            onPageChange={b.setPage}
            selectedCount={b.selectedKeys.length}
            busy={b.busy}
            onDeleteSelected={() => void b.deleteSelected()}
          />

          <BrowserNewFolderDialog
            open={b.newFolderModalOpen}
            onOpenChange={b.setNewFolderModalOpen}
            fileBucket={b.fileBucket}
            prefix={b.prefix}
            newFolderName={b.newFolderName}
            onNewFolderNameChange={b.setNewFolderName}
            busy={b.busy}
            onSubmit={() => void b.createFolderSubmit()}
          />

          <BrowserDeleteFolderDialog
            folderPath={b.deleteFolderPath}
            fileBucket={b.fileBucket}
            busy={b.busy}
            onOpenChange={() => b.setDeleteFolderPath(null)}
            onConfirm={() => void b.confirmDeleteFolder()}
          />

          <BrowserDeleteObjectDialog
            deleteKey={b.deleteKey}
            confirmValue={b.deleteConfirmValue}
            onConfirmValueChange={b.setDeleteConfirmValue}
            onOpenChange={() => {
              b.setDeleteKey(null);
              b.setDeleteConfirmValue('');
            }}
            onConfirm={() => void b.confirmDeleteObject()}
          />
        </Stack>
      )}

      <CreateBucketDialog
        open={b.createBucketOpen}
        onOpenChange={b.setCreateBucketOpen}
        token={b.token}
        loadBuckets={b.loadBuckets}
        onCreated={(name) => b.setFileBucket(name)}
      />
    </Box>
  );
}
