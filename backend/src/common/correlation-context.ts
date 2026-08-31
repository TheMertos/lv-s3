import { AsyncLocalStorage } from 'async_hooks';

type CorrelationStore = { correlationId: string };

const storage = new AsyncLocalStorage<CorrelationStore>();

/**
 * Runs a callback with correlation ID available to downstream code.
 */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

/**
 * Returns the active request correlation ID when inside middleware scope.
 */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
