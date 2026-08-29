// Test-only helpers for src/esi MSW suites. Not imported by production code.
import { HttpResponse } from 'msw';
import { COMPATIBILITY_DATE, USER_AGENT } from './client';

/**
 * Returns a 400 response when a request is missing the mandatory ESI headers,
 * so every mocked endpoint implicitly asserts they are sent. Null = headers OK.
 */
export function rejectBadEsiHeaders(request: Request): Response | null {
  if (request.headers.get('x-compatibility-date') !== COMPATIBILITY_DATE) {
    return HttpResponse.json({ error: 'missing or wrong X-Compatibility-Date' }, { status: 400 });
  }
  if (request.headers.get('x-user-agent') !== USER_AGENT) {
    return HttpResponse.json({ error: 'missing or wrong X-User-Agent' }, { status: 400 });
  }
  return null;
}
