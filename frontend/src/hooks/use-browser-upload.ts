import * as admin from '@/api/admin';

import { useCallback, useRef, useState, type DragEvent } from 'react';


/**
 * Upload and folder-creation handlers for the object browser.
 */
export function useBrowserUpload(opts: {
  token: string;
  fileBucket: string;
  prefix: string;
  uploadFile: (bucket: string, key: string, file: File) => Promise<void>;
  refreshList: () => Promise<void>;
  setMsg: (msg: string) => void;
  setBusy: (busy: boolean) => void;
}) {
  const { token, fileBucket, prefix, uploadFile, refreshList, setMsg, setBusy } = opts;
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [dragTargetPrefix, setDragTargetPrefix] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFilesToPrefix = useCallback(
    async (files: File[], targetPrefix: string) => {
      if (!files.length || !fileBucket) return;
      setMsg('');
      setBusy(true);
      const normalizedPrefix =
        targetPrefix && !targetPrefix.endsWith('/') ? `${targetPrefix}/` : targetPrefix;
      try {
        for (const f of files) {
          const key = `${normalizedPrefix || ''}${f.name}`;
          await uploadFile(fileBucket, key, f);
        }
        setMsg(`${files.length} file(s) uploaded`);
        await refreshList();
      } catch (e) {
        setMsg(String((e as Error).message));
      } finally {
        setBusy(false);
      }
    },
    [fileBucket, uploadFile, refreshList, setMsg, setBusy],
  );

  const createFolderSubmit = useCallback(async () => {
    const rel = newFolderName.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!rel) return;
    setBusy(true);
    try {
      const prefixNorm = prefix.replace(/\/$/, '');
      const full = prefixNorm ? `${prefixNorm}/${rel}` : rel;
      await admin.createFolderAdmin(token, fileBucket, full);
      setNewFolderModalOpen(false);
      setNewFolderName('');
      await refreshList();
    } catch (x) {
      setMsg(String((x as Error).message));
    } finally {
      setBusy(false);
    }
  }, [newFolderName, prefix, token, fileBucket, refreshList, setMsg, setBusy]);

  const handlePageDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      setDragTargetPrefix(null);
      const dropped = Array.from(e.dataTransfer.files || []);
      if (!dropped.length) return;
      await uploadFilesToPrefix(dropped, prefix);
    },
    [prefix, uploadFilesToPrefix],
  );

  return {
    newFolderModalOpen,
    setNewFolderModalOpen,
    newFolderName,
    setNewFolderName,
    dragActive,
    setDragActive,
    dragTargetPrefix,
    setDragTargetPrefix,
    fileInputRef,
    uploadFilesToPrefix,
    createFolderSubmit,
    handlePageDrop,
  };
}
