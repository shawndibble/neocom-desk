import type { Breadcrumb, Event as SentryEvent } from '@sentry/react';

const SECRET_PARAMS = new Set([
  'code',
  'state',
  'code_verifier',
  'client_secret',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
]);

const REDACTED = '[redacted]';

const PARAM_RE = /([?&#])([^=&#?\s]+)=([^&#\s]*)/g;

const BEARER_RE = /(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi;

const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

const TOKEN_FIELD_RE =
  /(\b(?:access_token|refresh_token|id_token|client_secret|code_verifier)["']?\s*[:=]\s*["']?)[^\s"',&}]+/gi;

export function redactSecrets(value: string): string {
  return value
    .replace(PARAM_RE, (match, separator: string, key: string) =>
      SECRET_PARAMS.has(key.toLowerCase()) ? `${separator}${key}=${REDACTED}` : match
    )
    .replace(BEARER_RE, `$1${REDACTED}`)
    .replace(JWT_RE, REDACTED)
    .replace(TOKEN_FIELD_RE, `$1${REDACTED}`);
}

const URL_BEARING_CRUMB_FIELDS = ['url', 'from', 'to'] as const;

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const scrubbed: Breadcrumb = { ...breadcrumb };
  if (typeof scrubbed.message === 'string') scrubbed.message = redactSecrets(scrubbed.message);
  if (scrubbed.data) {
    const data = { ...scrubbed.data };
    for (const field of URL_BEARING_CRUMB_FIELDS) {
      if (typeof data[field] === 'string') data[field] = redactSecrets(data[field]);
    }
    scrubbed.data = data;
  }
  return scrubbed;
}

function redactAttributes<T extends Record<string, unknown>>(attributes: T): T {
  const redacted: Record<string, unknown> = { ...attributes };
  for (const [key, value] of Object.entries(redacted)) {
    if (typeof value === 'string') redacted[key] = redactSecrets(value);
  }
  return redacted as T;
}

export function scrubEvent<E extends SentryEvent>(event: E): E {
  if (event.request) {
    event.request = {
      ...event.request,
      ...(event.request.url ? { url: redactSecrets(event.request.url) } : {}),
      ...(event.request.headers ? { headers: redactAttributes(event.request.headers) } : {}),
    };
  }
  if (typeof event.transaction === 'string') event.transaction = redactSecrets(event.transaction);
  if (typeof event.message === 'string') event.message = redactSecrets(event.message);
  if (event.exception?.values) {
    event.exception = {
      ...event.exception,
      values: event.exception.values.map((value) =>
        typeof value.value === 'string' ? { ...value, value: redactSecrets(value.value) } : value
      ),
    };
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);

  if (event.contexts?.trace?.data) {
    event.contexts = {
      ...event.contexts,
      trace: { ...event.contexts.trace, data: redactAttributes(event.contexts.trace.data) },
    };
  }
  if (event.spans) {
    event.spans = event.spans.map((span) => ({
      ...span,
      ...(typeof span.description === 'string'
        ? { description: redactSecrets(span.description) }
        : {}),
      ...(span.data ? { data: redactAttributes(span.data) } : {}),
    }));
  }

  return event;
}
