import type { EveWorkbenchEft } from '@/engine/fittings/load';
import { USER_AGENT } from '@/esi/userAgent';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_BASE = 'https://api.eveworkbench.com/v1';

export async function fetchEveWorkbenchEft(fitId: string): Promise<EveWorkbenchEft> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_BASE}/fits/${encodeURIComponent(fitId)}/eft`, {
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
