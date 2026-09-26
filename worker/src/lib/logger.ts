/**
 * Structured logging + request correlation.
 *
 * Logs are emitted as single-line JSON so they can be searched in
 * `wrangler tail`, Workers Logs or shipped to any log drain. Every request gets
 * a correlation id (`X-Request-Id`, generated or taken from the client/proxy)
 * that is echoed back and attached to every log line for that request.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: string | undefined): void {
  const normalized = (level ?? '').toLowerCase();
  if (normalized in LEVELS) currentLevel = normalized as LogLevel;
}

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  if (LEVELS[level] < LEVELS[currentLevel]) return;

  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, fields?: LogFields) => emit('debug', message, fields),
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
  /** Scoped logger that stamps every line with the same context. */
  child(context: LogFields) {
    return {
      debug: (message: string, fields?: LogFields) => emit('debug', message, { ...context, ...fields }),
      info: (message: string, fields?: LogFields) => emit('info', message, { ...context, ...fields }),
      warn: (message: string, fields?: LogFields) => emit('warn', message, { ...context, ...fields }),
      error: (message: string, fields?: LogFields) => emit('error', message, { ...context, ...fields }),
    };
  },
};

export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function normaliseRequestId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 64);
  return /^[A-Za-z0-9._-]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Reports an exception to Sentry's HTTP *store* API without pulling in the SDK.
 * Fire-and-forget: a failure here must never affect the user's request.
 */
export async function reportToSentry(
  dsn: string | undefined,
  error: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  if (!dsn) return;

  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    if (!publicKey) return;
    const projectId = url.pathname.replace(/^\//, '');
    const endpoint = `${url.protocol}//${url.host}/api/${projectId}/store/`;

    const err = error instanceof Error ? error : new Error(String(error));

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=lsc-worker/1.0, sentry_key=${publicKey}`,
      },
      body: JSON.stringify({
        event_id: newRequestId(),
        timestamp: new Date().toISOString(),
        platform: 'javascript',
        level: 'error',
        logger: 'worker',
        message: err.message,
        exception: {
          values: [{ type: err.name, value: err.message, stacktrace: { frames: [] } }],
        },
        extra: { ...context, stack: err.stack?.split('\n').slice(0, 12) },
      }),
    });
  } catch (reportingError) {
    console.warn(JSON.stringify({ level: 'warn', message: 'sentry report failed', error: String(reportingError) }));
  }
}
