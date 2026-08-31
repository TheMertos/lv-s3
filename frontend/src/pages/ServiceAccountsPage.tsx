import { PageErrorAlert } from '@/components/common/PageErrorAlert';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { AttachPolicyDialog } from '@/components/service-accounts/AttachPolicyDialog';
import { CreatedCredentialsDialog } from '@/components/service-accounts/CreatedCredentialsDialog';
import { CreateServiceAccountDialog } from '@/components/service-accounts/CreateServiceAccountDialog';
import { DeleteServiceAccountDialog } from '@/components/service-accounts/DeleteServiceAccountDialog';
import { DisableServiceAccountDialog } from '@/components/service-accounts/DisableServiceAccountDialog';
import { ServiceAccountsTable } from '@/components/service-accounts/ServiceAccountsTable';
import { useServiceAccounts } from '@/hooks/use-service-accounts';
import { useT } from '@/i18n/context';

import { Alert, Button, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';

/**
 * S3 service accounts: create keys for automation; attach IAM policies for SigV4 authorization.
 */
export function ServiceAccountsPage() {
  const t = useT();
  const sa = useServiceAccounts();

  const handleAttach = async (serviceAccountId: number, policyId: number) => {
    try {
      await sa.attachPolicy(serviceAccountId, policyId);
      notifications.show({
        message: t('serviceAccounts.policyAttached'),
        color: 'green',
      });
    } catch (e) {
      notifications.show({
        message: String((e as Error).message || t('common.somethingWentWrong')),
        color: 'red',
      });
      throw e;
    }
  };

  const handleDetach = async (serviceAccountId: number, policyId: number) => {
    try {
      await sa.detachPolicy(serviceAccountId, policyId);
      notifications.show({
        message: t('serviceAccounts.policyDetached'),
        color: 'green',
      });
    } catch (e) {
      notifications.show({
        message: String((e as Error).message || t('common.somethingWentWrong')),
        color: 'red',
      });
    }
  };

  return (
    <Stack gap="md" data-testid="service-accounts-page">
      <PageHeader
        title={t('serviceAccounts.title')}
        subtitle={t('serviceAccounts.subtitle')}
        right={<Button onClick={() => sa.setCreateOpen(true)}>{t('serviceAccounts.create')}</Button>}
      />

      <Alert title={t('serviceAccounts.alertTitle')} variant="light">
        {t('serviceAccounts.alertDescription')}
      </Alert>

      <PageErrorAlert message={sa.error} />

      {sa.loading ? (
        <TableSkeleton columns={6} />
      ) : (
        <ServiceAccountsTable
          rows={sa.rows}
          policiesByAccountId={sa.policiesByAccountId}
          busy={sa.busy}
          onCreate={() => sa.setCreateOpen(true)}
          onDisable={(id) => sa.setDisableId(id)}
          onDelete={(row) => sa.setDeleteTarget(row)}
          onAttachPolicy={(row) => sa.setAttachTarget(row)}
          onDetachPolicy={handleDetach}
        />
      )}

      <CreateServiceAccountDialog
        open={sa.createOpen}
        busy={sa.busy}
        onOpenChange={sa.setCreateOpen}
        onCreate={sa.createAccount}
      />
      <CreatedCredentialsDialog created={sa.created} onClose={() => sa.setCreated(null)} />
      <DisableServiceAccountDialog
        accountId={sa.disableId}
        busy={sa.busy}
        onOpenChange={(o) => !o && sa.setDisableId(null)}
        onConfirm={sa.disableAccount}
      />
      <DeleteServiceAccountDialog
        target={sa.deleteTarget}
        busy={sa.busy}
        onOpenChange={() => sa.setDeleteTarget(null)}
        onConfirm={sa.deleteAccount}
      />
      <AttachPolicyDialog
        target={sa.attachTarget}
        attachedPolicies={sa.attachTarget ? (sa.policiesByAccountId[sa.attachTarget.id] ?? []) : []}
        allPolicies={sa.allPolicies}
        busy={sa.busy}
        onOpenChange={(open) => !open && sa.setAttachTarget(null)}
        onAttach={handleAttach}
      />
    </Stack>
  );
}
