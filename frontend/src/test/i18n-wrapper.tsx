import { I18nProvider } from '@/i18n/context';

import type { ReactElement } from 'react';

/**
 * Wraps a component tree with I18nProvider for unit tests.
 */
export function withI18n(ui: ReactElement): ReactElement {
  return <I18nProvider>{ui}</I18nProvider>;
}
