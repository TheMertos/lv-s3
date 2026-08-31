
import * as admin from '@/api/admin';
import { useAuth } from '@/context/auth-context';

import { useCallback, useEffect, useState } from 'react';

/**
 * Manages bucket lifecycle rules: load, edit, save, and clear.
 */
export function useLifecyclePage() {
  const { token, buckets, loadBuckets, bucketsLoading, bucketsError } = useAuth();
  const [selectedBucket, setSelectedBucket] = useState('');
  const [rules, setRules] = useState<admin.LifecycleRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void loadBuckets();
  }, [loadBuckets]);

  useEffect(() => {
    if (!selectedBucket && buckets[0]?.name) {
      setSelectedBucket(buckets[0].name);
    }
  }, [buckets, selectedBucket]);

  const loadRules = useCallback(
    async (bucket: string) => {
      if (!token || !bucket) return;
      setLoading(true);
      setError('');
      setMsg('');
      try {
        const res = await admin.getBucketLifecycle(token, bucket);
        setRules(res.rules);
        setDirty(false);
      } catch (e) {
        setRules([]);
        setError(String((e as Error).message || 'Failed to load lifecycle rules'));
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (selectedBucket) void loadRules(selectedBucket);
  }, [selectedBucket, loadRules]);

  const updateRules = useCallback((next: admin.LifecycleRule[]) => {
    setRules(next);
    setDirty(true);
    setMsg('');
  }, []);

  const saveRules = useCallback(async () => {
    if (!token || !selectedBucket) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const res = await admin.putBucketLifecycle(token, selectedBucket, rules);
      setRules(res.rules);
      setDirty(false);
      setMsg('Lifecycle rules saved');
    } catch (e) {
      setError(String((e as Error).message || 'Save failed'));
    } finally {
      setSaving(false);
    }
  }, [token, selectedBucket, rules]);

  const clearRules = useCallback(async () => {
    if (!token || !selectedBucket) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      await admin.deleteBucketLifecycle(token, selectedBucket);
      setRules([]);
      setDirty(false);
      setMsg('All lifecycle rules removed');
    } catch (e) {
      setError(String((e as Error).message || 'Clear failed'));
    } finally {
      setSaving(false);
    }
  }, [token, selectedBucket]);

  const onBucketChange = useCallback((bucket: string) => {
    setSelectedBucket(bucket);
    setDirty(false);
    setMsg('');
    setError('');
  }, []);

  return {
    token,
    buckets,
    bucketsLoading,
    bucketsError,
    selectedBucket,
    onBucketChange,
    rules,
    updateRules,
    loading,
    saving,
    error,
    msg,
    dirty,
    saveRules,
    clearRules,
    reloadRules: () => void loadRules(selectedBucket),
  };
}
