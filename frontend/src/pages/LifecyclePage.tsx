import { PageErrorAlert } from '@/components/common/PageErrorAlert';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { LifecycleRulesTable } from '@/components/lifecycle/LifecycleRulesTable';
import { useLifecyclePage } from '@/hooks/use-lifecycle-page';
import { useT } from '@/i18n/context';

import { Alert, Button, Group, Select, Stack, Text } from '@mantine/core';

/**
 * Per-bucket lifecycle rule management (expiration and multipart abort).
 */
export function LifecyclePage() {
  const t = useT();
  const lc = useLifecyclePage();
  const noBuckets = !lc.bucketsLoading && lc.buckets.length === 0;

  return (
    <Stack gap="md" data-testid="lifecycle-page">
      <PageHeader
        title={t('lifecycle.title')}
        subtitle={t('lifecycle.subtitle')}
        right={
          <Group gap="sm">
            <Select
              data={lc.buckets.map((b) => ({ value: b.name, label: b.name }))}
              value={lc.selectedBucket || null}
              onChange={(v) => lc.onBucketChange(v ?? '')}
              placeholder={t('lifecycle.selectBucket')}
              disabled={lc.bucketsLoading || noBuckets}
              w={200}
            />
            <Button
              variant="default"
              size="sm"
              disabled={!lc.selectedBucket || lc.loading || lc.saving}
              onClick={() => void lc.reloadRules()}
            >
              {t('common.reload')}
            </Button>
          </Group>
        }
      />

      <Alert title={t('lifecycle.runnerTitle')} variant="light">
        {t('lifecycle.runnerDescription')}
      </Alert>

      <PageErrorAlert message={lc.bucketsError} title={t('errors.failedLoadBuckets')} />
      <PageErrorAlert message={lc.error} />

      {lc.msg ? (
        <Text size="sm" c="dimmed">
          {lc.msg}
        </Text>
      ) : null}

      {lc.bucketsLoading ? (
        <TableSkeleton columns={6} />
      ) : noBuckets ? (
        <Text size="sm" c="dimmed">
          {t('lifecycle.noBuckets')}
        </Text>
      ) : lc.loading ? (
        <TableSkeleton columns={6} />
      ) : (
        <>
          <LifecycleRulesTable rules={lc.rules} disabled={lc.saving} onChange={lc.updateRules} />
          <Group gap="sm">
            <Button disabled={!lc.dirty || lc.saving || !lc.selectedBucket} onClick={() => void lc.saveRules()}>
              {lc.saving ? t('lifecycle.saving') : t('lifecycle.saveRules')}
            </Button>
            <Button
              variant="default"
              disabled={lc.saving || !lc.selectedBucket || lc.rules.length === 0}
              onClick={() => void lc.clearRules()}
            >
              {t('lifecycle.clearRules')}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
