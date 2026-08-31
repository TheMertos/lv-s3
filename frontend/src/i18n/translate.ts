import type { EnMessages } from '@/i18n/messages/en';

/**
 * Resolves a dot-separated message key against nested message objects.
 */
function resolveMessage(messages: EnMessages, key: string): string | undefined {
  let cur: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(part in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Returns the English string for a message key, or the key if missing.
 */
export function translate(messages: EnMessages, key: string): string {
  return resolveMessage(messages, key) ?? key;
}
