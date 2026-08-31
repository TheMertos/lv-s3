
import * as admin from '@/api/admin';
import { useAuth } from '@/context/auth-context';

import { useCallback, useEffect, useState } from 'react';

/**
 * Loads and mutates IAM policies for the admin console page.
 */
export function useIamPolicies() {
  const { token } = useAuth();
  const [rows, setRows] = useState<admin.IamPolicyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<admin.IamPolicyRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<admin.IamPolicyRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await admin.listIamPolicies(token);
      setRows(list);
    } catch (e) {
      setRows([]);
      setError(String((e as Error).message || 'Failed to load IAM policies'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((row: admin.IamPolicyRow) => {
    setEditTarget(row);
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditTarget(null);
  }, []);

  const savePolicy = useCallback(
    async (payload: { name: string; document: Record<string, unknown> }) => {
      setBusy(true);
      setError('');
      try {
        if (editTarget) {
          await admin.updateIamPolicy(token, editTarget.id, {
            document: payload.document,
          });
        } else {
          await admin.createIamPolicy(token, {
            name: payload.name,
            document: payload.document,
          });
        }
        setFormOpen(false);
        setEditTarget(null);
        await load();
      } catch (e) {
        setError(String((e as Error).message || 'Save failed'));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [token, editTarget, load],
  );

  const deletePolicy = useCallback(
    async (id: number) => {
      setBusy(true);
      setError('');
      try {
        await admin.deleteIamPolicy(token, id);
        setDeleteTarget(null);
        await load();
      } catch (e) {
        setError(String((e as Error).message || 'Delete failed'));
      } finally {
        setBusy(false);
      }
    },
    [token, load],
  );

  return {
    rows,
    loading,
    busy,
    error,
    formOpen,
    setFormOpen,
    editTarget,
    deleteTarget,
    setDeleteTarget,
    openCreate,
    openEdit,
    closeForm,
    savePolicy,
    deletePolicy,
  };
}
