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
 * `beforeSend`'s half. Generic over the event type because transactions need
 * this as much as errors do: the router integration names the span after the
 * route pattern, but `request.url` still carries the raw `/callback?code=…`.
 *
 * Covers every field the browser SDK fills with a URL or with text that may
 * quote one, rather than trusting any single one of them to be the only
 * carrier.
 */
export function scrubEvent<E extends SentryEvent>(event: E): E {
  if (event.request?.url) {
    event.request = { ...event.request, url: redactSecrets(event.request.url) };
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
  return event;
}
