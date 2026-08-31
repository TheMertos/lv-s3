

import * as admin from '@/api/admin';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthProvider, type BucketRow } from '@/context/auth-context';
import { useAuthSession } from '@/context/auth-session';

import { Center, Loader } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';


/**
 * Wraps authenticated routes: loads token, provides auth context, and renders the app layout.
 */
export function ProtectedShell() {
  const { accessToken, isReady, logout: sessionLogout } = useAuthSession();
  const token = accessToken ?? '';
  const [buckets, setBuckets] = useState<BucketRow[]>([]);
  const [bucketsLoading, setBucketsLoading] = useState(false);
  const [bucketsError, setBucketsError] = useState('');

  const loadBuckets = useCallback(async () => {
    if (!token) return [];
    setBucketsLoading(true);
    setBucketsError('');
    try {
      const b = await admin.listBucketsAdmin(token);
      setBuckets(b);
      return b;
    } catch (e) {
      setBuckets([]);
      setBucketsError(String((e as Error).message || 'Failed to load buckets'));
      return [];
    } finally {
      setBucketsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadBuckets();
  }, [loadBuckets]);

  const uploadFile = useCallback(
    async (bucket: string, key: string, file: File): Promise<void> => {
      const multipartThreshold = 20 * 1024 * 1024;
      if (file.size < multipartThreshold) {
        await admin.uploadObjectAdmin(token, bucket, key, file);
        return;
      }
      const partSize = 8 * 1024 * 1024;
      const initiated = await admin.initiateMultipart(token, bucket, key, partSize, file.size);
      if (!initiated?.uploadId) {
        throw new Error('Initiate multipart failed');
      }
      const uploadId = initiated.uploadId;
      try {
        const totalParts = Math.ceil(file.size / partSize);
        for (let p = 1; p <= totalParts; p++) {
          const start = (p - 1) * partSize;
          const end = Math.min(start + partSize, file.size);
          const chunk = file.slice(start, end);
          await admin.uploadMultipartPart(token, bucket, uploadId, p, chunk);
        }
        await admin.completeMultipart(
          token,
          bucket,
          uploadId,
          key,
          Array.from({ length: totalParts }, (_, i) => i + 1),
        );
      } catch (e) {
        try {
          await admin.abortMultipart(token, bucket, uploadId);
        } catch {
          /* best-effort cleanup */
        }
        throw e;
      }
    },
    [token],
  );

  const logout = () => {
    void sessionLogout().finally(() => {
      window.location.href = '/';
    });
  };

  if (!isReady) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }

  if (!token) return <Navigate to="/" replace />;

  return (
    <AuthProvider
      value={{
        token,
        logout,
        loadBuckets,
        buckets,
        bucketsLoading,
        bucketsError,
        setBuckets,
        uploadFile,
      }}
    >
      <AppLayout />
    </AuthProvider>
  );
}
