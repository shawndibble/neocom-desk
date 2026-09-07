import type { Breadcrumb, Event as SentryEvent } from '@sentry/react';

/**
 * Query/fragment parameter names that must never reach Sentry.
 *
 * `code`/`state`/`code_verifier` are the EVE SSO PKCE handshake: an error
 * thrown anywhere during `/callback?code=…&state=…` would otherwise ship a
 * live authorization code with the event, because Sentry stamps the current
 * URL onto every event and names the pageload span after it. The `*_token`
 * names cover the exchange responses themselves. CLAUDE.md: refresh tokens
 * live in Dexie only and never reach logs — Sentry is a log sink.
 */
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

/**
 * Matches one `?key=value` / `&key=value` / `#key=value` pair. The leading
 * separator is what keeps a path segment (`/code=1/`) and prose
 * (`invalid state=abc`) from being mistaken for a parameter, so this stays
 * safe to run over free text as well as over URLs.
 */
const PARAM_RE = /([?&#])([^=&#?\s]+)=([^&#\s]*)/g;

/**
 * Redacts secret-bearing parameters anywhere in a string — a bare URL,
 * absolute or relative, or a URL embedded in an error message. Returns the
 * input unchanged when it carries nothing sensitive.
 */
export function redactSecrets(value: string): string {
  return value.replace(PARAM_RE, (match, separator: string, key: string) =>
    SECRET_PARAMS.has(key.toLowerCase()) ? `${separator}${key}=${REDACTED}` : match
  );
}

const URL_BEARING_CRUMB_FIELDS = ['url', 'from', 'to'] as const;

/** `beforeBreadcrumb`'s half: fetch/xhr crumbs carry `url`, navigation `from`/`to`. */
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

/**
 * Span attributes are a flat bag of arbitrary keys, so this redacts every
 * string value rather than guessing at the URL-bearing names. That is safe
 * because `redactSecrets` only ever rewrites a `?`/`&`/`#`-prefixed parameter
 * whose name is in `SECRET_PARAMS`; anything else is returned untouched.
 */
function redactAttributes<T extends Record<string, unknown>>(attributes: T): T {
  const redacted: Record<string, unknown> = { ...attributes };
  for (const [key, value] of Object.entries(redacted)) {
    if (typeof value === 'string') redacted[key] = redactSecrets(value);
  }
  return redacted as T;
}

/**
 * `beforeSend`'s half. Generic over the event type because transactions need
 * this as much as errors do: the router integration names the span after the
 * route pattern, but `request.url` still carries the raw `/callback?code=…`.
 *
 * Covers every field the browser SDK fills with a URL or with text that may
 * quote one, rather than trusting any single one of them to be the only
 * carrier.
 */
export function scrubEvent<E extends SentryEvent>(event: E): E {
  if (event.request) {
    // `headers` matters as much as `url` here: the SDK copies `document.referrer`
    // into `Referer`, so a client-side navigation away from `/callback` carries
    // the authorization code into the *next* event, whose own URL is innocent.
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

  // Transactions, which `event.request.url` alone does not cover: the browser
  // timing spans (`browser.request`, `browser.connect`, …) each describe
  // themselves with the whole URL, and both the root span and every child
  // repeat it under the `url.full` attribute. Verified by watching a real
  // envelope — the error event was already clean here while the transaction
  // was still shipping the raw query string.
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
