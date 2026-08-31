
import { enMessages } from '@/i18n/messages/en';
import { translate } from '@/i18n/translate';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type TranslateFn = (key: string) => string;

const I18nCtx = createContext<TranslateFn | null>(null);

/**
 * Provides the active locale translator to the React tree.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const t = useMemo(() => (key: string) => translate(enMessages, key), []);
  return <I18nCtx.Provider value={t}>{children}</I18nCtx.Provider>;
}

/**
 * Returns the translator function for the current locale.
 */
export function useT(): TranslateFn {
  const t = useContext(I18nCtx);
  if (!t) throw new Error('useT must be used within I18nProvider');
  return t;
}
