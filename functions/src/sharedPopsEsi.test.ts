import { describe, expect, it, vi } from 'vitest';
import { AFFILIATION_CACHE_MS, esiAffiliations, esiCorporationAlliance } from './sharedPopsEsi.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('esiAffiliations', () => {
  it('reads corporation and alliance, and asks again only after the cache lapses', async () => {
    let now = 0;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const ids = JSON.parse(String(init?.body)) as number[];
      return json(
        ids.map((id) => ({
          character_id: id,
          corporation_id: 98000000 + id,
          ...(id === 1 ? { alliance_id: 99000001 } : {}),
        }))
      );
    });
    const lookup = esiAffiliations(fetchImpl as unknown as typeof fetch, () => now);
    expect(await lookup([1, 2])).toEqual(
      new Map([
        [1, { corporationId: 98000001, allianceId: 99000001 }],
        [2, { corporationId: 98000002, allianceId: null }],
      ])
    );
    await lookup([1, 2]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = AFFILIATION_CACHE_MS;
    await lookup([2]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual([2]);
  });

  it('fails as backoff when ESI rate limits', async () => {
    const lookup = esiAffiliations((async () => json({}, 420)) as unknown as typeof fetch);
    await expect(lookup([1])).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});

describe('esiCorporationAlliance', () => {
  it("reads the corporation's alliance, or null outside one", async () => {
    expect(
      await esiCorporationAlliance((async () =>
        json({ alliance_id: 99000001 })) as unknown as typeof fetch)(98000001)
    ).toBe(99000001);
    expect(
      await esiCorporationAlliance((async () => json({ name: 'x' })) as unknown as typeof fetch)(
        98000001
      )
    ).toBeNull();
  });
});

describe('fetch rejection', () => {
  it('surfaces as unavailable, not a raw error', async () => {
    const boom = (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    await expect(esiAffiliations(boom)([1])).rejects.toMatchObject({ code: 'unavailable' });
    await expect(esiCorporationAlliance(boom)(1)).rejects.toMatchObject({ code: 'unavailable' });
  });
});
