/**
 * Appraisal → Janice. The pasted text goes to our Janice proxy Worker
 * (workers/janice-proxy), which holds the API key, and comes back as the link
 * to an appraisal Janice has stored at the same hub and Price Percent.
 */
import type { TradeHub } from '@/market/hubs';

/** The deployed proxy Worker. Public by design; the Janice key lives in the Worker. */
export const JANICE_PROXY_URL = 'https://janice.neocomdesk.com';

export type JaniceFailure =
  'too-large' | 'nothing-parsed' | 'rate-limited' | 'popup-blocked' | 'failed';

/** Where an appraisal link may point: the tab is only ever sent to Janice. */
const JANICE_APPRAISAL_PREFIX = 'https://janice.e-351.com/a/';

const REQUEST_TIMEOUT_MS = 20_000;

export type JaniceResult = { ok: true; url: string } | { ok: false; reason: JaniceFailure };

const KNOWN_FAILURES: readonly JaniceFailure[] = ['too-large', 'nothing-parsed', 'rate-limited'];

export async function requestJaniceAppraisal({
  text,
  hub,
  pricePercent,
  fetchFn = fetch,
}: {
  text: string;
  hub: TradeHub;
  pricePercent: number;
  fetchFn?: typeof fetch;
}): Promise<JaniceResult> {
  try {
    const res = await fetchFn(JANICE_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, hub: hub.id, pricePercent }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body: unknown = await res.json().catch(() => null);
    const record =
      body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    if (
      res.ok &&
      typeof record.url === 'string' &&
      record.url.startsWith(JANICE_APPRAISAL_PREFIX)
    ) {
      return { ok: true, url: record.url };
    }
    const reason = KNOWN_FAILURES.find((known) => known === record.error);
    return { ok: false, reason: reason ?? 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
