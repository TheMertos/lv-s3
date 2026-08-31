
import { useAuth } from '@/context/auth-context';
import { useBrowserCore } from '@/hooks/use-browser-core';
import { useBrowserMutations } from '@/hooks/use-browser-mutations';
import { useBrowserTable } from '@/hooks/use-browser-table';
import { useBrowserUpload } from '@/hooks/use-browser-upload';

import { useCallback } from 'react';

export type { SortBy, SortDir } from '@/hooks/browser-types';

/**
 * Composes core browse, table, upload, and mutation hooks for the object browser page.
 */
export function useObjectBrowser() {
  const { uploadFile } = useAuth();
  const core = useBrowserCore();
  const table = useBrowserTable(core.browse);
  const upload = useBrowserUpload({
    token: core.token,
    fileBucket: core.fileBucket,
    prefix: core.prefix,
    uploadFile,
    refreshList: core.refreshList,
    setMsg: core.setMsg,
    setBusy: core.setBusy,
  });
  const mutations = useBrowserMutations({
    token: core.token,
    fileBucket: core.fileBucket,
    refreshList: core.refreshList,
    setMsg: core.setMsg,
    setBusy: core.setBusy,
    selectedKeys: table.selectedKeys,
    setSelectedKeys: table.setSelectedKeys,
  });

  const setFileBucket = useCallback(
    (name: string) => {
      core.setFileBucket(name);
      table.resetView();
    },
    [core, table],
  );

  const setPrefix = useCallback(
    (next: string) => {
      core.setPrefix(next);
      table.resetView();
    },
    [core, table],
  );

  return {
    ...core,
    ...table,
    ...upload,
    ...mutations,
    setFileBucket,
    setPrefix,
  };
}
