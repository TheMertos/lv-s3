
import * as admin from '@/api/admin';
import { useAuth } from '@/context/auth-context';

import { useCallback, useEffect, useState } from 'react';

/**
 * Core browse state: bucket selection, prefix, list fetch, and shared UI flags.
 */
export function useBrowserCore() {
  const { token, buckets, loadBuckets, bucketsLoading, bucketsError } = useAuth();
  const [pickedBucket, setPickedBucket] = useState('');
  const [prefix, setPrefix] = useState('');
  const [browse, setBrowse] = useState<admin.BrowseResult | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [createBucketOpen, setCreateBucketOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fileBucket =
    pickedBucket && buckets.some((b) => b.name === pickedBucket)
      ? pickedBucket
      : (buckets[0]?.name ?? '');

  const setFileBucket = useCallback((name: string) => {
    setPickedBucket(name);
  }, []);

  const normalizedPrefix = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;

  const fetchBrowse = useCallback(
    async (continuationToken?: string) => {
      if (!token || !fileBucket) return null;
      return admin.browseBucketObjects(token, fileBucket, normalizedPrefix, continuationToken);
    },
    [token, fileBucket, normalizedPrefix],
  );

  const refreshList = useCallback(async () => {
    if (!token || !fileBucket) return;
    setErr('');
    try {
      setBrowse(await fetchBrowse());
    } catch (e) {
      setErr(String((e as Error).message || 'Failed to load objects.'));
      setBrowse(null);
    }
  }, [token, fileBucket, fetchBrowse]);

  const loadMore = useCallback(async () => {
    if (!token || !fileBucket || !browse?.isTruncated || !browse.nextContinuationToken || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setErr('');
    try {
      const next = await fetchBrowse(browse.nextContinuationToken);
      if (!next) return;
      setBrowse({
        prefixes: [...new Set([...(browse.prefixes ?? []), ...(next.prefixes ?? [])])],
        objects: [...(browse.objects ?? []), ...(next.objects ?? [])],
        isTruncated: next.isTruncated,
        nextContinuationToken: next.nextContinuationToken,
      });
    } catch (e) {
      setErr(String((e as Error).message || 'Failed to load more objects.'));
    } finally {
      setLoadingMore(false);
    }
  }, [token, fileBucket, browse, fetchBrowse, loadingMore]);

  useEffect(() => {
    void loadBuckets();
  }, [loadBuckets]);

  useEffect(() => {
    if (!token || !fileBucket) return;
    let active = true;
    void fetchBrowse()
      .then((data) => {
        if (active) {
          setBrowse(data);
          setErr('');
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setErr(String((e as Error).message || 'Failed to load objects.'));
          setBrowse(null);
        }
      });
    return () => {
      active = false;
    };
  }, [token, fileBucket, normalizedPrefix, fetchBrowse]);

  const bucketPublic = buckets.find((b) => b.name === fileBucket)?.publicRead ?? false;
  const hasBuckets = buckets.length > 0;
  const resolvedBrowse = token && fileBucket ? browse : null;

  return {
    token,
    buckets,
    bucketsLoading,
    bucketsError,
    loadBuckets,
    fileBucket,
    setFileBucket,
    prefix,
    setPrefix,
    browse: resolvedBrowse,
    err,
    msg,
    setMsg,
    busy,
    setBusy,
    refreshList,
    loadMore,
    loadingMore,
    bucketPublic,
    hasBuckets,
    createBucketOpen,
    setCreateBucketOpen,
  };
}
