import type { ValueTransformer } from 'typeorm';

/**
 * Preserves a nullable JavaScript-safe number for database writes.
 * @param value - Byte count represented as a safe integer.
 * @returns Unchanged number, preserving null.
 */
function bigintToDatabase(value: number | null): number | null {
  return value;
}

/**
 * Converts a nullable bigint database value into a JavaScript-safe number.
 * @param value - Driver value returned as a string or number.
 * @returns Number representation, preserving null.
 */
function bigintFromDatabase(value: string | number | null): number | null {
  if (value === null) return null;
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) {
    throw new Error(
      `Bigint value exceeds JavaScript safe integer range: ${value}`,
    );
  }
  return numberValue;
}

/** Maps safe JavaScript byte counts to and from SQL bigint columns. */
export const BIGINT_NUMBER_TRANSFORMER: ValueTransformer = {
  to: bigintToDatabase,
  from: bigintFromDatabase,
};
