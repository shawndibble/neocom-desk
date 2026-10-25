import { describe, expect, it, vi } from 'vitest';
import { LAWLESS_CORRUPTION_STATE } from './lawlessSystems.js';
import { LAWLESS_SYSTEMS_R2_KEY, publishLawlessSystems } from './publicDataLawlessSystems.js';

const NOW = Date.UTC(2026, 9, 25, 12);
const campaign = (id: number) => ({
  insurgencies: [{ corruptionState: LAWLESS_CORRUPTION_STATE, solarSystem: { id } }],
});

describe('publishLawlessSystems', () => {
  it('publishes the ids with a short cache time', async () => {
    const put = vi.fn(async () => {});
    const wrote = await publishLawlessSystems({
      put,
      fetchImpl: (async () =>
        Response.json([campaign(30000002), campaign(30000001)])) as typeof fetch,
      now: () => NOW,
    });
    expect(wrote).toBe(true);
    expect(put).toHaveBeenCalledWith(
      LAWLESS_SYSTEMS_R2_KEY,
      JSON.stringify({ systemIds: [30000001, 30000002], updatedAt: NOW }),
      expect.objectContaining({ 'Cache-Control': 'public, max-age=300' })
    );
  });

  it('publishes nothing when the feed fails or is not a list', async () => {
    const put = vi.fn();
    expect(
      await publishLawlessSystems({
        put,
        fetchImpl: (async () => new Response('', { status: 503 })) as typeof fetch,
      })
    ).toBe(false);
    expect(
      await publishLawlessSystems({
        put,
        fetchImpl: (async () => Response.json({ nope: 1 })) as typeof fetch,
      })
    ).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });
});
