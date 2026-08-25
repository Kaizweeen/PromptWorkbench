/**
 * Turning SDK and transport failures into something readable.
 *
 * The UI shows a sentence, never a stack trace. Retryability is decided here
 * from the status code, so the retry loop and the message agree.
 */

export type ErrorKind =
  | 'rate_limit'
  | 'overloaded'
  | 'server'
  | 'connection'
  | 'auth'
  | 'not_found'
  | 'invalid_request'
  | 'too_large'
  | 'no_key'
  | 'unknown';

export interface ReadableError {
  kind: ErrorKind;
  message: string;
  status?: number;
  retryable: boolean;
  /** From a Retry-After header, when the server sent one. */
  retryAfterMs?: number;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'No ANTHROPIC_API_KEY found. Copy .env.example to .env.local, add your key, and restart the dev server.',
    );
    this.name = 'MissingApiKeyError';
  }
}

/**
 * First line only, length-capped. Error messages reach the UI, and an
 * unknown failure's `message` may carry a whole stack trace behind its
 * first newline.
 */
function summarize(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const firstLine = message.split('\n', 1)[0].trim();
  if (firstLine === '') return undefined;
  return firstLine.length > 300 ? `${firstLine.slice(0, 299)}…` : firstLine;
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const record = headers as Record<string, string | undefined>;
  return record[name] ?? record[name.toLowerCase()];
}

/** Retry-After is seconds, or an HTTP date. Returns ms, or undefined. */
export function parseRetryAfter(headers: unknown, now = Date.now()): number | undefined {
  const raw = headerValue(headers, 'retry-after');
  if (!raw) return undefined;

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, date - now);

  return undefined;
}

const MESSAGES: Record<ErrorKind, string> = {
  rate_limit: 'Rate limited by the API. Retrying with backoff.',
  overloaded: 'The API is temporarily overloaded. Retrying with backoff.',
  server: 'The API returned a server error. Retrying with backoff.',
  connection: 'Could not reach the API. Check your network connection.',
  auth: 'The API rejected your key. Check ANTHROPIC_API_KEY in .env.local.',
  not_found: 'Unknown model or endpoint. Check the model ID in lib/config.ts.',
  invalid_request: 'The API rejected the request.',
  too_large: 'The prompt is too large for a single request.',
  no_key: 'No API key configured.',
  unknown: 'The run failed.',
};

function kindForStatus(status: number | undefined): ErrorKind {
  if (status === 429) return 'rate_limit';
  if (status === 529) return 'overloaded';
  if (status !== undefined && status >= 500) return 'server';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 413) return 'too_large';
  if (status !== undefined && status >= 400) return 'invalid_request';
  return 'unknown';
}

export const RETRYABLE_KINDS: readonly ErrorKind[] = [
  'rate_limit',
  'overloaded',
  'server',
  'connection',
];

/**
 * Normalise anything thrown during a run.
 *
 * Reads `status` off the SDK's error objects rather than matching on class
 * names, so it works for both real SDK errors and plain fetch failures.
 */
export function toReadableError(error: unknown): ReadableError {
  if (error instanceof MissingApiKeyError) {
    return { kind: 'no_key', message: error.message, retryable: false };
  }

  const err = error as {
    status?: number;
    headers?: unknown;
    message?: string;
    error?: { error?: { message?: string } };
    name?: string;
  };

  // A connection failure has no HTTP status.
  if (err?.status === undefined) {
    const name = err?.name ?? '';
    const isConnection =
      name === 'APIConnectionError' ||
      name === 'APIConnectionTimeoutError' ||
      name === 'TypeError' ||
      name === 'AbortError';

    if (isConnection) {
      return { kind: 'connection', message: MESSAGES.connection, retryable: true };
    }

    const summary = summarize(err?.message);
    return {
      kind: 'unknown',
      message: summary ? `The run failed: ${summary}` : MESSAGES.unknown,
      retryable: false,
    };
  }

  const kind = kindForStatus(err.status);
  const retryable = RETRYABLE_KINDS.includes(kind);

  // Prefer the API's own explanation for non-retryable errors — "messages:
  // roles must alternate" is far more useful than "the API rejected this".
  const apiMessage = summarize(err.error?.error?.message ?? err.message);
  const message =
    !retryable && apiMessage ? `${MESSAGES[kind]} ${apiMessage}` : MESSAGES[kind];

  return {
    kind,
    message,
    status: err.status,
    retryable,
    retryAfterMs: parseRetryAfter(err.headers),
  };
}
