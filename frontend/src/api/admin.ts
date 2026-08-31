import {
  authFetchForm,
  authFetchJson,
  createAuthClient,
  createPublicClient,
  credentialedFetch,
  resolveAdminApiBase,
  unwrapData,
} from '@/api/client';
import type { components } from '@/api/generated/admin-api';
import { messageFromApiBody } from '@/lib/api-error';

export type BrowseResult = components['schemas']['BrowseResponseDto'];
export type LifecycleRule = components['schemas']['LifecycleRuleDto'];
export type ServiceAccountRow = components['schemas']['ServiceAccountListItemDto'];
export type ServiceAccountCreated = components['schemas']['ServiceAccountCreatedDto'];
export type IamPolicyRow = components['schemas']['IamPolicyDto'];
export type CreateIamPolicyBody = components['schemas']['CreateIamPolicyDto'];
export type UpdateIamPolicyBody = components['schemas']['UpdateIamPolicyDto'];
export type S3Credentials = components['schemas']['S3CredentialsDto'];
export type S3AccessKeyMeta = components['schemas']['S3AccessKeyMetaDto'];

/** One audit log row from GET /audit. */
export type AuditLogItem = {
  id: number;
  action: string;
  actorType: string;
  actorId: number | null;
  actorName: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  correlationId: string | null;
  createdAt: string;
};

/** Paginated audit log list. */
export type AuditListResponse = {
  items: AuditLogItem[];
  page: number;
  pageSize: number;
  total: number;
};

/** Active multipart upload row. */
export type MultipartUploadRow = {
  uploadId: string;
  key: string;
  createdAt: string;
};

/**
 * POST login; returns tokens.
 */
export async function login(username: string, password: string) {
  const client = createPublicClient();
  const result = await client.POST('/auth/login', { body: { username, password } });
  if (result.response.status === 429) {
    throw new Error(messageFromApiBody(result.error, 'Too many attempts'));
  }
  const fallback =
    result.response.status === 401
      ? 'Login failed (wrong username or password)'
      : 'Login failed';
  return unwrapData(result, fallback);
}

/**
 * Lists buckets (admin JWT).
 */
export async function listBucketsAdmin(token: string) {
  const client = createAuthClient(token);
  const result = await client.GET('/buckets');
  return unwrapData(result, 'Buckets list failed');
}

/**
 * Creates bucket (admin).
 */
export async function createBucketAdmin(token: string, name: string, encryptAtRest?: boolean) {
  const client = createAuthClient(token);
  const result = await client.POST('/buckets', {
    body: { name, encryptAtRest: encryptAtRest === true },
  });
  return unwrapData(result, 'Create bucket failed');
}

/**
 * Deletes bucket (requires empty bucket).
 */
export async function deleteBucketAdmin(token: string, name: string) {
  const client = createAuthClient(token);
  const result = await client.DELETE('/buckets/{name}', { params: { path: { name } } });
  return unwrapData(result, 'Delete bucket failed');
}

/**
 * Lists folders + objects under prefix (admin).
 */
export async function browseBucketObjects(
  token: string,
  bucket: string,
  prefix: string,
  continuationToken?: string,
) {
  const client = createAuthClient(token);
  const result = await client.POST('/buckets/{name}/objects/list', {
    params: { path: { name: bucket } },
    body: {
      prefix: prefix || undefined,
      continuationToken: continuationToken || undefined,
    },
  });
  return unwrapData(result, 'Browse failed');
}

/**
 * POST /auth/refresh using HttpOnly cookie; returns new access token.
 */
export async function refreshAccessToken() {
  const response = await credentialedFetch(`${resolveAdminApiBase()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(messageFromApiBody(body, 'Session refresh failed'));
  }
  return (await response.json()) as { accessToken: string; expiresIn: number };
}

/**
 * POST /auth/logout; clears refresh cookie server-side.
 */
export async function logout() {
  const response = await credentialedFetch(`${resolveAdminApiBase()}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok && response.status !== 204) {
    const body = await response.json().catch(() => ({}));
    throw new Error(messageFromApiBody(body, 'Logout failed'));
  }
}

/**
 * Lists audit log entries with pagination and optional filters.
 */
export async function listAuditLogs(
  token: string,
  query: {
    page?: number;
    pageSize?: number;
    action?: string;
    actorName?: string;
    from?: string;
    to?: string;
  },
): Promise<AuditListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.action) params.set('action', query.action);
  if (query.actorName) params.set('actorName', query.actorName);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const qs = params.toString();
  return authFetchJson<AuditListResponse>(token, `/audit${qs ? `?${qs}` : ''}`);
}

/**
 * Lists in-progress multipart uploads for a bucket.
 */
export async function listMultipartUploads(
  token: string,
  bucket: string,
): Promise<MultipartUploadRow[]> {
  return authFetchJson<MultipartUploadRow[]>(
    token,
    `/multipart/${encodeURIComponent(bucket)}/uploads?status=in_progress`,
  );
}

/**
 * Returns admin S3 access key metadata (no secret).
 */
export async function getS3AccessKeyMeta(token: string): Promise<S3AccessKeyMeta> {
  const client = createAuthClient(token);
  const result = await client.GET('/auth/s3-credentials/access-key');
  return unwrapData(result, 'Failed to load access key metadata');
}

/**
 * Returns admin S3 credentials (secret shown once per request).
 */
export async function getS3Credentials(token: string): Promise<S3Credentials> {
  const client = createAuthClient(token);
  const result = await client.GET('/auth/s3-credentials');
  return unwrapData(result, 'Failed to load S3 credentials');
}

/**
 * Rotates admin S3 credentials; returns new key pair once.
 */
export async function rotateS3Credentials(token: string): Promise<S3Credentials> {
  const client = createAuthClient(token);
  const result = await client.POST('/auth/s3-credentials/rotate', { body: undefined });
  return unwrapData(result, 'Failed to rotate S3 credentials');
}

/**
 * Creates folder path under bucket.
 */
export async function createFolderAdmin(token: string, bucket: string, path: string) {
  const client = createAuthClient(token);
  const result = await client.POST('/buckets/{name}/objects/folder', {
    params: { path: { name: bucket } },
    body: { path },
  });
  return unwrapData(result, 'Folder failed');
}

/**
 * Deletes an empty folder (path without trailing slash).
 */
export async function deleteFolderAdmin(token: string, bucket: string, folderPath: string) {
  const client = createAuthClient(token);
  const result = await client.DELETE('/buckets/{name}/objects/folder', {
    params: { path: { name: bucket } },
    body: { path: folderPath.replace(/\/+$/, '') },
  });
  return unwrapData(result, 'Delete folder failed');
}

/**
 * Uploads one file to key.
 */
export async function uploadObjectAdmin(token: string, bucket: string, key: string, file: File) {
  const client = createAuthClient(token);
  const fd = new FormData();
  fd.append('file', file);
  fd.append('key', key);
  const result = await client.POST('/buckets/{name}/objects/upload', {
    params: { path: { name: bucket } },
    body: fd as never,
  });
  return unwrapData(result, 'Upload failed');
}

/**
 * Downloads object via admin API (JWT); triggers browser save as file.
 */
export async function downloadObjectAdmin(
  token: string,
  bucket: string,
  key: string,
  filename: string,
): Promise<void> {
  const client = createAuthClient(token);
  const result = await client.GET('/buckets/{name}/objects/download', {
    params: { path: { name: bucket }, query: { key } },
    parseAs: 'blob',
  });
  if (result.error !== undefined || !result.data) {
    throw new Error(messageFromApiBody(result.error, 'Download failed'));
  }
  const blob = result.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.split('/').pop() || filename || 'download';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Deletes object by key.
 */
export async function deleteObjectAdmin(token: string, bucket: string, key: string) {
  const client = createAuthClient(token);
  const result = await client.DELETE('/buckets/{name}/objects', {
    params: { path: { name: bucket } },
    body: { key },
  });
  return unwrapData(result, 'Delete failed');
}

/**
 * Updates bucket public-read visibility.
 */
export async function setBucketPublic(token: string, name: string, publicRead: boolean) {
  const client = createAuthClient(token);
  const result = await client.PUT('/buckets/{name}/visibility', {
    params: { path: { name } },
    body: { publicRead },
  });
  return unwrapData(result, 'Update failed');
}

/**
 * Reads lifecycle rules for a bucket.
 */
export async function getBucketLifecycle(token: string, bucket: string) {
  const client = createAuthClient(token);
  const result = await client.GET('/lifecycle/{bucket}', { params: { path: { bucket } } });
  return unwrapData(result, 'Lifecycle read failed');
}

/**
 * Replaces lifecycle rules for a bucket.
 */
export async function putBucketLifecycle(token: string, bucket: string, rules: LifecycleRule[]) {
  const client = createAuthClient(token);
  const result = await client.PUT('/lifecycle/{bucket}', {
    params: { path: { bucket } },
    body: { rules },
  });
  return unwrapData(result, 'Lifecycle update failed');
}

/**
 * Clears lifecycle rules for a bucket.
 */
export async function deleteBucketLifecycle(token: string, bucket: string) {
  const client = createAuthClient(token);
  const result = await client.DELETE('/lifecycle/{bucket}', { params: { path: { bucket } } });
  return unwrapData(result, 'Lifecycle delete failed');
}

/**
 * Starts multipart upload.
 */
export async function initiateMultipart(
  token: string,
  bucket: string,
  key: string,
  partSize?: number,
  totalSize?: number,
) {
  return authFetchJson<{
    uploadId: string;
    bucket: string;
    key: string;
    partSize: number | null;
  }>(token, `/multipart/${encodeURIComponent(bucket)}/initiate`, {
    method: 'POST',
    body: JSON.stringify({ key, partSize, totalSize }),
  });
}

/**
 * Uploads one multipart part.
 */
export async function uploadMultipartPart(
  token: string,
  bucket: string,
  uploadId: string,
  partNumber: number,
  blob: Blob,
) {
  const fd = new FormData();
  fd.append('part', new File([blob], `part-${partNumber}.bin`));
  return authFetchForm<{ partNumber: number; etag: string; size: number }>(
    token,
    `/multipart/${encodeURIComponent(bucket)}/${encodeURIComponent(uploadId)}/part/${partNumber}`,
    fd,
    'PUT',
  );
}

/**
 * Lists uploaded multipart parts.
 */
export async function listMultipartParts(token: string, bucket: string, uploadId: string) {
  return authFetchJson<{
    uploadId: string;
    bucket: string;
    key: string;
    parts: { partNumber: number; size: number; etag: string }[];
  }>(
    token,
    `/multipart/${encodeURIComponent(bucket)}/${encodeURIComponent(uploadId)}/parts`,
  );
}

/**
 * Completes multipart upload.
 */
export async function completeMultipart(
  token: string,
  bucket: string,
  uploadId: string,
  key: string,
  partNumbers: number[],
) {
  return authFetchJson<{ key: string; size: number; etag: string }>(
    token,
    `/multipart/${encodeURIComponent(bucket)}/${encodeURIComponent(uploadId)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({ key, partNumbers }),
    },
  );
}

/**
 * Aborts multipart upload.
 */
export async function abortMultipart(token: string, bucket: string, uploadId: string) {
  return authFetchJson<{ ok: true }>(
    token,
    `/multipart/${encodeURIComponent(bucket)}/${encodeURIComponent(uploadId)}`,
    { method: 'DELETE' },
  );
}

/**
 * Lists S3 service accounts (no secrets).
 */
export async function listServiceAccounts(token: string): Promise<ServiceAccountRow[]> {
  const client = createAuthClient(token);
  const result = await client.GET('/service-accounts');
  return unwrapData(result, 'Service accounts list failed');
}

/**
 * Creates a service account; response includes secret key shown once.
 */
export async function createServiceAccount(
  token: string,
  label?: string,
): Promise<ServiceAccountCreated> {
  const client = createAuthClient(token);
  const result = await client.POST('/service-accounts', {
    body: label?.trim() ? { label: label.trim() } : {},
  });
  return unwrapData(result, 'Create service account failed');
}

/**
 * Disables a service account (stops SigV4 auth for that key).
 */
export async function disableServiceAccount(token: string, id: number): Promise<void> {
  const client = createAuthClient(token);
  const result = await client.PATCH('/service-accounts/{id}/disable', {
    params: { path: { id: String(id) } },
  });
  if (result.error) {
    throw new Error(messageFromApiBody(result.error, 'Disable failed'));
  }
}

/**
 * Deletes a service account permanently.
 */
export async function deleteServiceAccount(token: string, id: number): Promise<void> {
  const client = createAuthClient(token);
  const result = await client.DELETE('/service-accounts/{id}', {
    params: { path: { id: String(id) } },
  });
  if (result.error) {
    throw new Error(messageFromApiBody(result.error, 'Delete failed'));
  }
}

/**
 * Lists IAM policies attached to a service account.
 */
export async function listServiceAccountPolicies(
  token: string,
  serviceAccountId: number,
): Promise<IamPolicyRow[]> {
  const client = createAuthClient(token);
  const result = await client.GET('/service-accounts/{id}/policies', {
    params: { path: { id: String(serviceAccountId) } },
  });
  return unwrapData(result, 'Service account policies list failed');
}

/**
 * Lists IAM policies (admin JWT).
 */
export async function listIamPolicies(token: string): Promise<IamPolicyRow[]> {
  const client = createAuthClient(token);
  const result = await client.GET('/iam/policies');
  return unwrapData(result, 'IAM policies list failed');
}

/**
 * Loads one IAM policy by id.
 */
export async function getIamPolicy(token: string, id: number): Promise<IamPolicyRow> {
  const client = createAuthClient(token);
  const result = await client.GET('/iam/policies/{id}', {
    params: { path: { id: String(id) } },
  });
  return unwrapData(result, 'IAM policy load failed');
}

/**
 * Creates an IAM policy with a validated document.
 */
export async function createIamPolicy(
  token: string,
  body: CreateIamPolicyBody,
): Promise<IamPolicyRow> {
  const client = createAuthClient(token);
  const result = await client.POST('/iam/policies', { body });
  return unwrapData(result, 'Create IAM policy failed');
}

/**
 * Partially updates an IAM policy name and/or document.
 */
export async function updateIamPolicy(
  token: string,
  id: number,
  body: UpdateIamPolicyBody,
): Promise<IamPolicyRow> {
  const client = createAuthClient(token);
  const result = await client.PATCH('/iam/policies/{id}', {
    params: { path: { id: String(id) } },
    body,
  });
  return unwrapData(result, 'Update IAM policy failed');
}

/**
 * Deletes an IAM policy and its service-account attachments.
 */
export async function deleteIamPolicy(token: string, id: number): Promise<void> {
  const client = createAuthClient(token);
  const result = await client.DELETE('/iam/policies/{id}', {
    params: { path: { id: String(id) } },
  });
  if (result.error) {
    throw new Error(messageFromApiBody(result.error, 'Delete IAM policy failed'));
  }
}

/**
 * Attaches a policy to a service account.
 */
export async function attachIamPolicy(
  token: string,
  policyId: number,
  serviceAccountId: number,
): Promise<void> {
  const client = createAuthClient(token);
  const result = await client.POST('/iam/policies/{id}/attach', {
    params: { path: { id: String(policyId) } },
    body: { serviceAccountId },
  });
  if (result.error) {
    throw new Error(messageFromApiBody(result.error, 'Attach IAM policy failed'));
  }
}

/**
 * Detaches a policy from a service account.
 */
export async function detachIamPolicy(
  token: string,
  policyId: number,
  serviceAccountId: number,
): Promise<void> {
  const client = createAuthClient(token);
  const result = await client.POST('/iam/policies/{id}/detach', {
    params: { path: { id: String(policyId) } },
    body: { serviceAccountId },
  });
  if (result.error) {
    throw new Error(messageFromApiBody(result.error, 'Detach IAM policy failed'));
  }
}
