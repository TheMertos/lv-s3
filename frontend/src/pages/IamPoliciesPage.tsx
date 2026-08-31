import { PageErrorAlert } from '@/components/common/PageErrorAlert';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import { DeleteIamPolicyDialog } from '@/components/iam/DeleteIamPolicyDialog';
import { IamPoliciesTable } from '@/components/iam/IamPoliciesTable';
import { IamPolicyFormDialog } from '@/components/iam/IamPolicyFormDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { useIamPolicies } from '@/hooks/use-iam-policies';
import { useT } from '@/i18n/context';

import { Alert, Button, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';

/**
 * IAM policies admin page: CRUD for statement-based S3 authorization documents.
 */
export function IamPoliciesPage() {
  const t = useT();
  const policies = useIamPolicies();

  const handleSave = async (payload: { name: string; document: Record<string, unknown> }) => {
    try {
      await policies.savePolicy(payload);
      notifications.show({
        message: policies.editTarget ? t('iamPolicies.updated') : t('iamPolicies.created'),
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

  return (
    <Stack gap="md" data-testid="iam-policies-page">
      <PageHeader
        title={t('iamPolicies.title')}
        subtitle={t('iamPolicies.subtitle')}
        right={
          <Button onClick={() => policies.openCreate()}>{t('iamPolicies.create')}</Button>
        }
      />

      <Alert title={t('iamPolicies.alertTitle')} variant="light">
        {t('iamPolicies.alertDescription')}
      </Alert>

      <PageErrorAlert message={policies.error} />

      {policies.loading ? (
        <TableSkeleton columns={4} />
      ) : (
        <IamPoliciesTable
          rows={policies.rows}
          onCreate={() => policies.openCreate()}
          onEdit={(row) => policies.openEdit(row)}
          onDelete={(row) => policies.setDeleteTarget(row)}
        />
      )}

      <IamPolicyFormDialog
        open={policies.formOpen}
        busy={policies.busy}
        initial={policies.editTarget}
        onOpenChange={(open) => {
          if (!open) policies.closeForm();
        }}
        onSubmit={handleSave}
      />
      <DeleteIamPolicyDialog
        target={policies.deleteTarget}
        busy={policies.busy}
        onOpenChange={() => policies.setDeleteTarget(null)}
        onConfirm={policies.deletePolicy}
      />
    </Stack>
  );
}
