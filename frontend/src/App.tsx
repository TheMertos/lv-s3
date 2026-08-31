import { AuthSessionProvider } from '@/context/auth-session';
import { AuditPage } from '@/pages/AuditPage';
import { BrowserPage } from '@/pages/BrowserPage';
import { BucketsPage } from '@/pages/BucketsPage';
import { IamPoliciesPage } from '@/pages/IamPoliciesPage';
import { LifecyclePage } from '@/pages/LifecyclePage';
import { LoginPage } from '@/pages/LoginPage';
import { S3CredentialsPage } from '@/pages/S3CredentialsPage';
import { ServiceAccountsPage } from '@/pages/ServiceAccountsPage';
import { UploadsPage } from '@/pages/UploadsPage';
import { ProtectedShell } from '@/routes/ProtectedShell';

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

/**
 * Root router for the LV S3 admin console.
 */
export default function App() {
  return (
    <AuthSessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/app" element={<ProtectedShell />}>
            <Route index element={<Navigate to="browser" replace />} />
            <Route path="browser" element={<BrowserPage />} />
            <Route path="buckets" element={<BucketsPage />} />
            <Route path="lifecycle" element={<LifecyclePage />} />
            <Route path="service-accounts" element={<ServiceAccountsPage />} />
            <Route path="iam-policies" element={<IamPoliciesPage />} />
            <Route path="uploads" element={<UploadsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="s3-credentials" element={<S3CredentialsPage />} />
            <Route path="access-keys" element={<Navigate to="/app/service-accounts" replace />} />
          </Route>
          <Route path="/keys" element={<Navigate to="/app/browser" replace />} />
          <Route path="/s3" element={<Navigate to="/app/browser" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthSessionProvider>
  );
}
