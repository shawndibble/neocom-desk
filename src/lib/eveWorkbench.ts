/**
 * EVE Workbench's public fit API, for a Load of a Workbench fit link (#2483).
 * A published fit's EFT comes back with no key, and the API echoes the
 * caller's Origin in its CORS headers, so the browser reads it directly.
 *
 * Workbench answers a missing, private or malformed fit id with HTTP 200 and
 * `Error: true`; its message wording isn't relied on, only that flag.
 */
import type { EveWorkbenchEft } from '@/engine/fittings/load';
import { USER_AGENT } from '@/esi/userAgent';

const API_BASE = 'https://api.eveworkbench.com/v1';

export async function fetchEveWorkbenchEft(fitId: string): Promise<EveWorkbenchEft> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/fits/${encodeURIComponent(fitId)}/eft`, {
      headers: { 'X-User-Agent': USER_AGENT },
    });
  } catch {
    return { status: 'failed' };
  }
  if (response.status === 404) return { status: 'not-found' };
  if (!response.ok) return { status: 'failed' };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'failed' };
  }
  if (typeof body !== 'object' || body === null) return { status: 'failed' };
  const { Eft, Error: isError } = body as { Eft?: unknown; Error?: unknown };
  if (isError === true) return { status: 'not-found' };
  return typeof Eft === 'string' && Eft.trim() !== ''
    ? { status: 'ok', eft: Eft }
    : { status: 'failed' };
}
