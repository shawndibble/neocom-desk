import { describe, it, expect } from 'vitest';
import type { Breadcrumb, ErrorEvent } from '@sentry/react';
import { redactSecrets, scrubBreadcrumb, scrubEvent } from './scrub';

describe('redactSecrets', () => {
  it('redacts the SSO authorization code and state off the callback URL', () => {
    expect(redactSecrets('https://neocomdesk.com/callback?code=abc123&state=xyz789')).toBe(
      'https://neocomdesk.com/callback?code=[redacted]&state=[redacted]'
    );
  });

  it('redacts tokens carried in a fragment, not just a query string', () => {
    expect(redactSecrets('https://neocomdesk.com/#access_token=abc&expires_in=1200')).toBe(
      'https://neocomdesk.com/#access_token=[redacted]&expires_in=1200'
    );
  });

  it('redacts every known secret parameter name, case-insensitively', () => {
    const url =
      'https://x/y?code=1&state=2&access_token=3&refresh_token=4&id_token=5&token=6&code_verifier=7&client_secret=8';
    expect(redactSecrets(url)).toBe(
      'https://x/y?code=[redacted]&state=[redacted]&access_token=[redacted]&refresh_token=[redacted]&id_token=[redacted]&token=[redacted]&code_verifier=[redacted]&client_secret=[redacted]'
    );
    expect(redactSecrets('https://x/y?CODE=1&Refresh_Token=2')).toBe(
      'https://x/y?CODE=[redacted]&Refresh_Token=[redacted]'
    );
  });

  it('leaves harmless parameters and plain URLs untouched', () => {
    expect(
      redactSecrets('https://esi.evetech.net/characters/95465499/skills/?datasource=tranquility')
    ).toBe('https://esi.evetech.net/characters/95465499/skills/?datasource=tranquility');
    expect(redactSecrets('https://neocomdesk.com/skills/plans')).toBe(
      'https://neocomdesk.com/skills/plans'
    );
  });

  it('redacts inside a relative URL and inside surrounding prose', () => {
    expect(redactSecrets('/callback?code=abc&state=def')).toBe(
      '/callback?code=[redacted]&state=[redacted]'
    );
    expect(redactSecrets('Failed to fetch /callback?code=abc — network down')).toBe(
      'Failed to fetch /callback?code=[redacted] — network down'
    );
  });

  it('does not mistake a path segment or bare word for a parameter', () => {
    expect(redactSecrets('https://x/code=1/state=2')).toBe('https://x/code=1/state=2');
    expect(redactSecrets('invalid state=abc returned')).toBe('invalid state=abc returned');
  });
});

describe('scrubBreadcrumb', () => {
  it('redacts the url, from and to fields of a navigation or fetch crumb', () => {
    const crumb: Breadcrumb = {
      category: 'navigation',
      data: { from: '/callback?code=abc', to: '/overview?state=xyz', url: '/x?refresh_token=t' },
    };
    expect(scrubBreadcrumb(crumb).data).toEqual({
      from: '/callback?code=[redacted]',
      to: '/overview?state=[redacted]',
      url: '/x?refresh_token=[redacted]',
    });
  });

  it('redacts the crumb message and leaves non-string data alone', () => {
    const crumb: Breadcrumb = {
      message: 'GET /callback?code=abc',
      data: { status_code: 500, url: 'https://x/?token=t' },
    };
    const scrubbed = scrubBreadcrumb(crumb);
    expect(scrubbed.message).toBe('GET /callback?code=[redacted]');
    expect(scrubbed.data).toEqual({ status_code: 500, url: 'https://x/?token=[redacted]' });
  });

  it('returns a crumb with no data or message unchanged', () => {
    expect(scrubBreadcrumb({ category: 'ui.click' })).toEqual({ category: 'ui.click' });
  });
});

describe('scrubEvent', () => {
  it('redacts the request URL, transaction name, message and exception values', () => {
    const event = {
      request: { url: 'https://neocomdesk.com/callback?code=abc&state=xyz' },
      transaction: '/callback?code=abc',
      message: 'boom at /callback?code=abc',
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'Failed to fetch https://login.eveonline.com/x?refresh_token=r',
          },
        ],
      },
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event);
    expect(scrubbed.request?.url).toBe(
      'https://neocomdesk.com/callback?code=[redacted]&state=[redacted]'
    );
    expect(scrubbed.transaction).toBe('/callback?code=[redacted]');
    expect(scrubbed.message).toBe('boom at /callback?code=[redacted]');
    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      'Failed to fetch https://login.eveonline.com/x?refresh_token=[redacted]'
    );
  });

  it('redacts every breadcrumb on the event', () => {
    const event = {
      breadcrumbs: [
        { category: 'navigation', data: { to: '/callback?code=abc' } },
        { category: 'fetch', data: { url: 'https://x/?access_token=t' } },
      ],
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event);
    expect(scrubbed.breadcrumbs?.[0]?.data?.to).toBe('/callback?code=[redacted]');
    expect(scrubbed.breadcrumbs?.[1]?.data?.url).toBe('https://x/?access_token=[redacted]');
  });

  it('survives an event with none of the optional fields present', () => {
    expect(() => scrubEvent({} as ErrorEvent)).not.toThrow();
  });
});
