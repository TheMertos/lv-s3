export type ApiErrorBody = {
  code?: string;
  message?: string | string[];
  details?: Record<string, unknown>;
};

/**
 * Extracts a user-facing message from a unified API error body.
 */
export function messageFromApiBody(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback;
  const msg = (body as ApiErrorBody).message;
  if (typeof msg === 'string' && msg.length > 0) return msg;
  if (Array.isArray(msg) && msg.length > 0) return msg.join(', ');
  return fallback;
}

/**
 * Parses a failed Response and throws Error with the API message when present.
 */
export async function throwApiError(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => ({}));
  throw new Error(messageFromApiBody(body, fallback));
}
