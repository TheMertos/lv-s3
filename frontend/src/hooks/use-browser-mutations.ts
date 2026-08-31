
import * as admin from '@/api/admin';
import { publicObjectUrl } from '@/lib/s3-public-base';

import { useCallback, useState } from 'react';

/**
 * Delete, download, and public-URL actions for the object browser.
 */
export function useBrowserMutations(opts: {
  token: string;
  fileBucket: string;
  refreshList: () => Promise<void>;
  setMsg: (msg: string) => void;
  setBusy: (busy: boolean) => void;
  selectedKeys: string[];
  setSelectedKeys: (keys: string[]) => void;
}) {
  const { token, fileBucket, refreshList, setMsg, setBusy, selectedKeys, setSelectedKeys } = opts;
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState('');
  const [deleteFolderPath, setDeleteFolderPath] = useState<string | null>(null);

  const deleteSelected = useCallback(async () => {
    setBusy(true);
    setMsg('');
    try {
      for (const k of selectedKeys) {
        await admin.deleteObjectAdmin(token, fileBucket, k);
      }
      setSelectedKeys([]);
      await refreshList();
      setMsg(`Deleted ${selectedKeys.length} object(s)`);
    } catch (e) {
      setMsg(String((e as Error).message || 'Delete failed'));
    } finally {
      setBusy(false);
    }
  }, [selectedKeys, token, fileBucket, refreshList, setBusy, setSelectedKeys, setMsg]);

  const downloadObject = useCallback(
    async (key: string, name: string) => {
      setBusy(true);
      setMsg('');
      try {
        await admin.downloadObjectAdmin(token, fileBucket, key, name);
        setMsg(`Downloaded ${name}`);
      } catch (e) {
        setMsg(String((e as Error).message || 'Download failed'));
      } finally {
        setBusy(false);
      }
    },
    [token, fileBucket, setMsg, setBusy],
  );

  const copyPublicUrl = useCallback(
    (key: string) => {
      const url = publicObjectUrl(fileBucket, key);
      if (!url) return;
      void navigator.clipboard.writeText(url);
      setMsg('Public URL copied');
    },
    [fileBucket, setMsg],
  );

  const confirmDeleteObject = useCallback(async () => {
    const k = deleteKey;
    setDeleteKey(null);
    setDeleteConfirmValue('');
    if (!k) return;
    setBusy(true);
    setMsg('');
    try {
      await admin.deleteObjectAdmin(token, fileBucket, k);
      await refreshList();
      setMsg(`Deleted ${k.split('/').pop() || k}`);
    } catch (e) {
      setMsg(String((e as Error).message || 'Delete failed'));
    } finally {
      setBusy(false);
    }
  }, [deleteKey, token, fileBucket, refreshList, setBusy, setMsg]);

  const confirmDeleteFolder = useCallback(async () => {
    const fp = deleteFolderPath;
    setDeleteFolderPath(null);
    if (!fp) return;
    setBusy(true);
    setMsg('');
    try {
      await admin.deleteFolderAdmin(token, fileBucket, fp);
      setMsg(`Deleted folder ${fp.split('/').pop() || fp}`);
      await refreshList();
    } catch (e) {
      setMsg(String((e as Error).message || 'Delete folder failed'));
    } finally {
      setBusy(false);
    }
  }, [deleteFolderPath, token, fileBucket, refreshList, setMsg, setBusy]);

  return {
    deleteKey,
    setDeleteKey,
    deleteConfirmValue,
    setDeleteConfirmValue,
    deleteFolderPath,
    setDeleteFolderPath,
    deleteSelected,
    downloadObject,
    copyPublicUrl,
    confirmDeleteObject,
    confirmDeleteFolder,
  };
}
