import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LpCorporationEntry } from './marketTypes';

const CORPS: LpCorporationEntry[] = [
  { id: 1000120, name: 'Federation Navy', factionId: 500004 },
  { id: 1000130, name: 'Sisters of EVE' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  // Fresh module per test: the loader memoizes for the whole session.
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadLpCorporations', () => {
  it('reads the LP Store corporation snapshot from market/lpCorporations.json', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CORPS));
    const { loadLpCorporations } = await import('./loadMarketSde');

    expect(await loadLpCorporations()).toEqual(CORPS);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/data\/market\/lpCorporations\.json/);
  });

  it('fetches the snapshot once however many callers ask', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CORPS));
    const { loadLpCorporations } = await import('./loadMarketSde');

    await Promise.all([loadLpCorporations(), loadLpCorporations(), loadLpCorporations()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed read instead of memoizing the failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, 503));
    fetchMock.mockResolvedValueOnce(jsonResponse(CORPS));
    const { loadLpCorporations } = await import('./loadMarketSde');

    await expect(loadLpCorporations()).rejects.toThrow(/lpCorporations\.json/);
    expect(await loadLpCorporations()).toEqual(CORPS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
