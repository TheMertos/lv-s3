
import * as admin from '@/api/admin';
import { useAuth } from '@/context/auth-context';

import { useCallback, useEffect, useState } from 'react';

/**
 * Loads service accounts, their attached IAM policies, and attach/detach mutations.
 */
export function useServiceAccounts() {
  const { token } = useAuth();
  const [rows, setRows] = useState<admin.ServiceAccountRow[]>([]);
  const [allPolicies, setAllPolicies] = useState<admin.IamPolicyRow[]>([]);
  const [policiesByAccountId, setPoliciesByAccountId] = useState<
    Record<number, admin.IamPolicyRow[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<admin.ServiceAccountCreated | null>(null);
  const [disableId, setDisableId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<admin.ServiceAccountRow | null>(null);
  const [attachTarget, setAttachTarget] = useState<admin.ServiceAccountRow | null>(null);

  /**
   * Fetches attached policies for each service account in parallel.
   * Propagates failures so callers can surface them like other loads.
   * @param accounts - Service accounts whose attached policies to load
   */
  const loadPoliciesForAccounts = useCallback(
    async (accounts: admin.ServiceAccountRow[]) => {
      const entries = await Promise.all(
        accounts.map(async (sa) => {
          const policies = await admin.listServiceAccountPolicies(token, sa.id);
          return [sa.id, policies] as const;
        }),
      );
      setPoliciesByAccountId(Object.fromEntries(entries));
    },
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, policies] = await Promise.all([
        admin.listServiceAccounts(token),
        admin.listIamPolicies(token),
      ]);
      setRows(list);
      setAllPolicies(policies);
      await loadPoliciesForAccounts(list);
    } catch (e) {
      setRows([]);
      setAllPolicies([]);
      setPoliciesByAccountId({});
      setError(String((e as Error).message || 'Failed to load service accounts'));
    } finally {
      setLoading(false);
    }
  }, [token, loadPoliciesForAccounts]);

  useEffect(() => {
    void load();
  }, [load]);

  const createAccount = useCallback(
    async (label: string) => {
      setBusy(true);
      setError('');
      try {
        const c = await admin.createServiceAccount(token, label || undefined);
        setCreateOpen(false);
        setCreated(c);
        await load();
      } catch (e) {
        setError(String((e as Error).message || 'Create failed'));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [token, load],
  );

  const disableAccount = useCallback(
    async (id: number) => {
      setBusy(true);
      setError('');
      try {
        await admin.disableServiceAccount(token, id);
        setDisableId(null);
        await load();
      } catch (e) {
        setError(String((e as Error).message || 'Disable failed'));
      } finally {
        setBusy(false);
      }
    },
    [token, load],
  );

  const deleteAccount = useCallback(
    async (id: number) => {
      setBusy(true);
      setError('');
      try {
        await admin.deleteServiceAccount(token, id);
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

  /**
   * Attaches an IAM policy to the given service account and refreshes policy lists.
   */
  const attachPolicy = useCallback(
    async (serviceAccountId: number, policyId: number) => {
      setBusy(true);
      setError('');
      try {
        await admin.attachIamPolicy(token, policyId, serviceAccountId);
        setAttachTarget(null);
        await load();
      } catch (e) {
        setError(String((e as Error).message || 'Attach policy failed'));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [token, load],
  );

  /**
   * Detaches an IAM policy from the given service account and refreshes policy lists.
   */
  const detachPolicy = useCallback(
    async (serviceAccountId: number, policyId: number) => {
      setBusy(true);
      setError('');
      try {
        await admin.detachIamPolicy(token, policyId, serviceAccountId);
        await load();
      } catch (e) {
        setError(String((e as Error).message || 'Detach policy failed'));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [token, load],
  );

  return {
    rows,
    allPolicies,
    policiesByAccountId,
    loading,
    busy,
    error,
    createOpen,
    setCreateOpen,
    created,
    setCreated,
    disableId,
    setDisableId,
    deleteTarget,
    setDeleteTarget,
    attachTarget,
    setAttachTarget,
    createAccount,
    disableAccount,
    deleteAccount,
    attachPolicy,
    detachPolicy,
  };
}
