import type { IamPolicyRow } from '@/api/admin';
import {
  documentToForm,
  emptyStatement,
  formToDocument,
  IAM_ACTIONS,
  parseAdvancedDocument,
  validatePolicyForm,
  type IamPolicyFormState,
  type StatementFormRow,
} from '@/components/iam/iam-policy-form';
import { useT } from '@/i18n/context';

import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

type IamPolicyFormDialogProps = {
  open: boolean;
  busy: boolean;
  initial: IamPolicyRow | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { name: string; document: Record<string, unknown> }) => Promise<void>;
};

type IamPolicyFormProps = {
  initial: IamPolicyRow | null;
  busy: boolean;
  onSubmit: (payload: { name: string; document: Record<string, unknown> }) => Promise<void>;
  onCancel: () => void;
};

const actionOptions = IAM_ACTIONS.map((a) => ({ value: a, label: a }));

/**
 * One statement block in the structured policy editor.
 */
function StatementEditor({
  index,
  statement,
  onChange,
  onRemove,
  canRemove,
  t,
}: {
  index: number;
  statement: StatementFormRow;
  onChange: (next: StatementFormRow) => void;
  onRemove: () => void;
  canRemove: boolean;
  t: (key: string) => string;
}) {
  return (
    <Stack
      gap="sm"
      p="sm"
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          {t('iamPolicies.statementHeading')} {index + 1}
        </Text>
        {canRemove ? (
          <ActionIcon variant="subtle" color="red" onClick={onRemove} aria-label={t('iamPolicies.removeStatement')}>
            <IconTrash size={16} />
          </ActionIcon>
        ) : null}
      </Group>
      <TextInput
        label={t('iamPolicies.sidOptional')}
        value={statement.sid}
        onChange={(e) => onChange({ ...statement, sid: e.currentTarget.value })}
        placeholder="ReadPhotos"
      />
      <Select
        label={t('iamPolicies.effect')}
        data={[
          { value: 'Allow', label: 'Allow' },
          { value: 'Deny', label: 'Deny' },
        ]}
        value={statement.effect}
        onChange={(v) => onChange({ ...statement, effect: v === 'Deny' ? 'Deny' : 'Allow' })}
      />
      <MultiSelect
        label={t('iamPolicies.actions')}
        data={actionOptions}
        value={statement.actions}
        onChange={(actions) => onChange({ ...statement, actions })}
        searchable
        nothingFoundMessage={t('iamPolicies.noActionsFound')}
      />
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('iamPolicies.resources')}
        </Text>
        {statement.resources.map((resource, ri) => (
          <Group key={`resource-${index}-${ri}`} align="flex-end" gap="xs">
            <TextInput
              style={{ flex: 1 }}
              value={resource}
              onChange={(e) => {
                const resources = [...statement.resources];
                resources[ri] = e.currentTarget.value;
                onChange({ ...statement, resources });
              }}
              placeholder="arn:lv-s3:::my-bucket/*"
            />
            {statement.resources.length > 1 ? (
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => {
                  const resources = statement.resources.filter((_, i) => i !== ri);
                  onChange({ ...statement, resources });
                }}
                aria-label={t('iamPolicies.removeResource')}
              >
                <IconTrash size={16} />
              </ActionIcon>
            ) : null}
          </Group>
        ))}
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconPlus size={14} />}
          onClick={() => onChange({ ...statement, resources: [...statement.resources, ''] })}
        >
          {t('iamPolicies.addResource')}
        </Button>
      </Stack>
    </Stack>
  );
}

/**
 * Inner form remounted when dialog opens for a different policy.
 */
function IamPolicyForm({ initial, busy, onSubmit, onCancel }: IamPolicyFormProps) {
  const t = useT();
  const [advanced, setAdvanced] = useState(false);
  const [form, setForm] = useState<IamPolicyFormState>(() =>
    initial
      ? documentToForm(initial.name, initial.document as Record<string, unknown>)
      : { name: '', statements: [emptyStatement()] },
  );
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(
      initial
        ? initial.document
        : formToDocument({ name: '', statements: [emptyStatement()] }),
      null,
      2,
    ),
  );
  const [err, setErr] = useState('');

  const handleAdvancedToggle = (checked: boolean) => {
    if (checked) {
      setJsonText(JSON.stringify(formToDocument(form), null, 2));
    } else {
      try {
        const doc = parseAdvancedDocument(jsonText);
        setForm(documentToForm(form.name, doc));
      } catch {
        // Keep structured form as-is when JSON is invalid during toggle off
      }
    }
    setAdvanced(checked);
    setErr('');
  };

  const submit = async () => {
    setErr('');
    try {
      let document: Record<string, unknown>;
      if (advanced) {
        if (!form.name.trim()) {
          setErr(t('iamPolicies.nameRequired'));
          return;
        }
        document = parseAdvancedDocument(jsonText);
      } else {
        const validationErr = validatePolicyForm(form);
        if (validationErr) {
          setErr(validationErr);
          return;
        }
        document = formToDocument(form);
      }
      await onSubmit({ name: form.name.trim(), document });
    } catch (e) {
      setErr(String((e as Error).message || t('common.somethingWentWrong')));
    }
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('iamPolicies.formHint')}
      </Text>
      <TextInput
        label={t('iamPolicies.policyName')}
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
        placeholder="read-only-photos"
        maxLength={128}
        disabled={!!initial}
      />
      <Switch
        label={t('iamPolicies.advancedJson')}
        checked={advanced}
        onChange={(e) => handleAdvancedToggle(e.currentTarget.checked)}
      />
      {advanced ? (
        <Textarea
          label={t('iamPolicies.documentJson')}
          value={jsonText}
          onChange={(e) => setJsonText(e.currentTarget.value)}
          minRows={12}
          autosize
          ff="monospace"
          styles={{ input: { fontSize: 'var(--mantine-font-size-xs)' } }}
        />
      ) : (
        <>
          {form.statements.map((statement, index) => (
            <StatementEditor
              key={`stmt-${index}`}
              index={index}
              statement={statement}
              t={t}
              canRemove={form.statements.length > 1}
              onChange={(next) =>
                setForm((f) => ({
                  ...f,
                  statements: f.statements.map((s, i) => (i === index ? next : s)),
                }))
              }
              onRemove={() =>
                setForm((f) => ({
                  ...f,
                  statements: f.statements.filter((_, i) => i !== index),
                }))
              }
            />
          ))}
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={() =>
              setForm((f) => ({ ...f, statements: [...f.statements, emptyStatement()] }))
            }
          >
            {t('iamPolicies.addStatement')}
          </Button>
        </>
      )}
      {err ? (
        <Text size="sm" c="red">
          {err}
        </Text>
      ) : null}
      <Divider />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button loading={busy} onClick={() => void submit()}>
          {initial ? t('common.save') : t('common.create')}
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * Modal to create or edit an IAM policy with structured statements or raw JSON.
 */
export function IamPolicyFormDialog({
  open,
  busy,
  initial,
  onOpenChange,
  onSubmit,
}: IamPolicyFormDialogProps) {
  const t = useT();

  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title={initial ? t('iamPolicies.editTitle') : t('iamPolicies.createTitle')}
      size="lg"
    >
      {open ? (
        <IamPolicyForm
          key={initial?.id ?? 'new'}
          initial={initial}
          busy={busy}
          onSubmit={async (payload) => {
            await onSubmit(payload);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      ) : null}
    </Modal>
  );
}
