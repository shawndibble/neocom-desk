import { beforeEach, describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { clearShipGroupCache, parseEsiKillmail, srpKillmailSource } from './srpKillmailEsi.js';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('parseEsiKillmail', () => {
  it('reads victim, hull, system and time', () => {
    expect(
      parseEsiKillmail(5, {
        killmail_time: '2026-10-21T12:00:00Z',
        solar_system_id: 30000142,
        victim: { character_id: 1, corporation_id: 2, ship_type_id: 587 },
      })
    ).toMatchObject({
      killedAt: Date.parse('2026-10-21T12:00:00Z'),
      solarSystemId: 30000142,
      victim: { characterId: 1, corporationId: 2, shipTypeId: 587, items: [] },
    });
  });
  it('keeps each top-level item flag for the doctrine check', () => {
    const km = parseEsiKillmail(5, {
      killmail_time: '2026-10-21T12:00:00Z',
      solar_system_id: 1,
      victim: {
        ship_type_id: 587,
        items: [{ item_type_id: 405, flag: 27, quantity_destroyed: 1 }, { item_type_id: 34 }],
      },
    });
    expect(km.victim.items[0]).toMatchObject({ item_type_id: 405, flag: 27 });
    expect(km.victim.items[1]).not.toHaveProperty('flag');
  });
  it('refuses a killmail it cannot read', () => {
    expect(() => parseEsiKillmail(5, { victim: {} })).toThrow(HttpsError);
  });
});

describe('srpKillmailSource', () => {
  beforeEach(clearShipGroupCache);

  it('zkill returns hash and value, and never throws', async () => {
    const hash = 'c'.repeat(40);
    const ok = srpKillmailSource(() => json([{ zkb: { hash, totalValue: 12.5e6 } }]));
    expect(await ok.zkill(1)).toEqual({ hash, totalValue: 12.5e6 });
    for (const fetchImpl of [
      () => json({}, 429),
      () => Promise.reject(new Error('down')),
      () => json('nope'),
    ]) {
      expect(await srpKillmailSource(fetchImpl as typeof fetch).zkill(1)).toEqual({
        hash: null,
        totalValue: null,
      });
    }
  });

  it('asks ESI for each hull group once', async () => {
    let calls = 0;
    const source = srpKillmailSource((() => {
      calls += 1;
      return json({ group_id: 25 });
    }) as unknown as typeof fetch);
    expect(await source.shipGroupId(587)).toBe(25);
    expect(await source.shipGroupId(587)).toBe(25);
    expect(calls).toBe(1);
  });

  it('sends the identifying headers to ESI', async () => {
    let seen: Record<string, string> = {};
    const source = srpKillmailSource(((_url: string, init: RequestInit) => {
      seen = init.headers as Record<string, string>;
      return json({ group_id: 25 });
    }) as unknown as typeof fetch);
    expect(await source.shipGroupId(587)).toBe(25);
    expect(seen['X-Compatibility-Date']).toBeTruthy();
    expect(seen['X-User-Agent']).toContain('Neocom Desk');
  });

  it('maps ESI 404 to killmail-not-found', async () => {
    const source = srpKillmailSource(() => json({}, 404));
    await expect(source.killmail(1, 'a'.repeat(40))).rejects.toMatchObject({
      details: { reason: 'killmail-not-found' },
    });
  });

  it('jitaValue sums sell-min x quantity, skipping unpriced types, null on failure', async () => {
    const priced = srpKillmailSource(() =>
      json({
        '34': { sell: { min: '5.0', orderCount: '10' } },
        '35': { sell: { min: '0', orderCount: '0' } },
      })
    );
    expect(
      await priced.jitaValue(
        new Map([
          [34, 4],
          [35, 9],
        ])
      )
    ).toBe(20);
    expect(await srpKillmailSource(() => json({}, 500)).jitaValue(new Map([[34, 1]]))).toBeNull();
  });
});
