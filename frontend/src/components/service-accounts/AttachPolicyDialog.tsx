
import type { IamPolicyRow, ServiceAccountRow } from '@/api/admin';
import { useT } from '@/i18n/context';

import { Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { useMemo, useState } from 'react';

type AttachPolicyDialogProps = {
  target: ServiceAccountRow | null;
  attachedPolicies: IamPolicyRow[];
  allPolicies: IamPolicyRow[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onAttach: (serviceAccountId: number, policyId: number) => Promise<void>;
};

/**
 * Modal to attach an IAM policy to a service account from available policies.
 */
export function AttachPolicyDialog({
  target,
  attachedPolicies,
  allPolicies,
  busy,
  onOpenChange,
  onAttach,
}: AttachPolicyDialogProps) {
  const t = useT();
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);

  const attachedIds = useMemo(
    () => new Set(attachedPolicies.map((p) => p.id)),
    [attachedPolicies],
  );

  const availablePolicies = useMemo(
    () => allPolicies.filter((p) => !attachedIds.has(p.id)),
    [allPolicies, attachedIds],
  );

  const policyOptions = useMemo(
    () =>
      availablePolicies.map((p) => ({
        value: String(p.id),
        label: p.name,
      })),
    [availablePolicies],
  );

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onOpenChange(false);
      setSelectedPolicyId(null);
    }
  };

  return (
    <Modal
      opened={!!target}
      onClose={() => handleOpenChange(false)}
      title={t('serviceAccounts.attachPolicyTitle')}
    >
      <Stack gap="md">
        {target ? (
          <Text ff="monospace" size="xs" c="dimmed">
            {target.accessKey}
          </Text>
        ) : null}
        {availablePolicies.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('serviceAccounts.noPoliciesToAttach')}
          </Text>
        ) : (
          <Select
            label={t('serviceAccounts.selectPolicy')}
            placeholder={t('serviceAccounts.selectPolicyPlaceholder')}
            data={policyOptions}
            value={selectedPolicyId}
            onChange={setSelectedPolicyId}
            searchable
            nothingFoundMessage={t('serviceAccounts.noPoliciesToAttach')}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={busy || !target || !selectedPolicyId || availablePolicies.length === 0}
            loading={busy}
            onClick={async () => {
              if (!target || !selectedPolicyId) return;
              await onAttach(target.id, Number(selectedPolicyId));
              setSelectedPolicyId(null);
            }}
          >
            {t('serviceAccounts.attachPolicy')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
