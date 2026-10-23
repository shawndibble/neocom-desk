import { describe, expect, it } from 'vitest';
import type { Killmail } from '@/esi/endpoints';
import { collectLosses } from './lostLosses';

const HASH = 'f'.repeat(40);
const ME = 90000001;
const CORP = 98000001;
const km = (id: number, over: Partial<Killmail['victim']> = {}, time = '2026-10-20T10:00:00Z') =>
  ({
    killmail_id: id,
    killmail_time: time,
    solar_system_id: 30000142,
    victim: { ship_type_id: 100, character_id: ME, corporation_id: CORP, ...over },
  }) as Killmail;

const run = (details: Record<number, Killmail | null>) =>
  collectLosses({
    refs: Object.keys(details).map((id) => ({ killmail_id: Number(id), killmail_hash: HASH })),
    readKillmail: async (id) => details[id] ?? null,
    characterId: ME,
    corporationId: CORP,
    groupOf: (typeId) => (typeId === 100 ? 10 : 20),
  });

describe('collectLosses', () => {
  it('keeps only the pilot own losses in the current corporation, newest first', async () => {
    const out = await run({
      1: km(1, {}, '2026-10-01T00:00:00Z'),
      2: km(2, { character_id: 5 }), // a kill: someone else died
      3: km(3, { corporation_id: 99 }), // lost in another corp: the server would refuse it
      4: km(4, {}, '2026-10-10T00:00:00Z'),
    });
    expect(out.map((l) => l.killmailId)).toEqual([4, 1]);
    expect(out[0]).toMatchObject({
      killmailHash: HASH,
      hullTypeId: 100,
      classId: 10,
      solarSystemId: 30000142,
      killedAt: Date.parse('2026-10-10T00:00:00Z'),
    });
  });

  it('skips a killmail ESI cannot read or that lacks what a claim needs', async () => {
    const out = await run({
      1: null,
      2: { killmail_id: 2, victim: { ship_type_id: 100, character_id: ME, corporation_id: CORP } },
      3: km(3),
    });
    expect(out.map((l) => l.killmailId)).toEqual([3]);
  });

  it('survives one killmail read failing', async () => {
    const out = await collectLosses({
      refs: [
        { killmail_id: 1, killmail_hash: HASH },
        { killmail_id: 2, killmail_hash: HASH },
      ],
      readKillmail: async (id) => {
        if (id === 1) throw new Error('boom');
        return km(2);
      },
      characterId: ME,
      corporationId: CORP,
      groupOf: () => 10,
    });
    expect(out.map((l) => l.killmailId)).toEqual([2]);
  });
});
