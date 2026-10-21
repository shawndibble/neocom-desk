import { http, HttpResponse } from 'msw';
import { ESI_BASE_URL } from '@/esi/client';
import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';

/**
 * msw handlers that make the price fallbacks behind Fuzzwork (ESI order books,
 * the R2 daily open prices) fail, so a test of "Fuzzwork is down" still means
 * "no price" instead of reaching a real source. `server.use(...)` it in a
 * `beforeEach`; a test that wants a fallback up overrides it with its own handler.
 */
export const fallbackSourcesDown = [
  http.get(`${ESI_BASE_URL}/markets/*`, () => HttpResponse.error()),
  http.get(`${R2_SNAPSHOT_ORIGIN}/open-prices/*`, () => new HttpResponse(null, { status: 404 })),
];
