import { useT } from '@/i18n/context';

import { Alert } from '@mantine/core';

type PageErrorAlertProps = {
  title?: string;
  message: string;
};

/**
 * Displays a page-level error banner for failed API loads or actions.
 */
export function PageErrorAlert({ message, title }: PageErrorAlertProps) {
  const t = useT();
  const alertTitle = title ?? t('common.somethingWentWrong');
  if (!message) return null;
  return (
    <Alert color="red" title={alertTitle} mb="md">
      {message}
    </Alert>
  );
}
