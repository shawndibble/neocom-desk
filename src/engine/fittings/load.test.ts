import { describe, expect, it, vi } from 'vitest';
import type { FittingSlotAssignment } from '@/sde/types';
import { loadText, toLoadOutcome, type LoadParts, type TextLoadSources } from './load';

const TYPES: Record<string, number> = { rifter: 587, '125mm gatling autocannon i': 484 };
const SLOTS: Record<string, FittingSlotAssignment> = { 484: 'high' };
const VICTIM = {
  ship_type_id: 587,
  items: [{ item_type_id: 484, flag: 27, quantity_destroyed: 1, singleton: 0 }],
};
const HASH = 'a'.repeat(40);

function sources(overrides: Partial<TextLoadSources> = {}): TextLoadSources {
  return {
    catalog: vi.fn(async () => ({
      typeByName: {
        get: (name: string) => (TYPES[name] === undefined ? undefined : { typeID: TYPES[name]! }),
      },
      slotByTypeId: SLOTS,
    })),
    hullName: vi.fn(async (typeId: number) => (typeId === 587 ? 'Rifter' : 'Other')),
    killmailHash: vi.fn(async () => HASH),
    killmailVictim: vi.fn(async () => VICTIM),
    ...overrides,
  };
}

const RIFTER_MODULES = [{ slot: 'high', slotIndex: 0, typeId: 484, state: 'active' }];

describe('toLoadOutcome', () => {
  it("names a resolved Load's Fitting and keeps what it couldn't place", () => {
    const parts: LoadParts = {
      hullTypeId: 587,
      modules: [],
      drones: [],
      cargo: [],
      unresolved: [{ text: 'Nope', reason: 'unknown item' }],
    };
    expect(toLoadOutcome(parts, 'My Rifter', 'file')).toEqual({
      kind: 'fitting',
      source: 'file',
      fitting: { name: 'My Rifter', shipTypeId: 587, modules: [], drones: [], cargo: [] },
      unresolved: [{ text: 'Nope', reason: 'unknown item' }],
    });
  });

  it('fails a Load whose hull did not resolve, with the reason in its warnings', () => {
    const parts: LoadParts = {
      hullTypeId: null,
      unresolved: [{ text: 'Not A Ship', reason: 'unknown ship' }],
    };
    expect(toLoadOutcome(parts, '', 'file')).toEqual({
      kind: 'failed',
      source: 'file',
      error: null,
      unresolved: [{ text: 'Not A Ship', reason: 'unknown ship' }],
    });
  });
});

describe('loadText', () => {
  it('passes a pasted Share Link through as its own code, reading nothing', async () => {
    const src = sources();
    expect(await loadText('https://app.example/fittings?f=abc123', src)).toEqual({
      kind: 'share',
      code: 'abc123',
    });
    expect(src.catalog).not.toHaveBeenCalled();
  });

  it('reports text it cannot read as unrecognised, reading nothing', async () => {
    const src = sources();
    expect(await loadText('not a fitting at all', src)).toEqual({
      kind: 'failed',
      source: 'text',
      error: 'unrecognised',
      unresolved: [],
    });
    expect(src.catalog).not.toHaveBeenCalled();
  });

  it('opens EFT text under the hull name, with the lines it could not place', async () => {
    const outcome = await loadText(
      ['[Rifter, My Fit]', '125mm Gatling AutoCannon I', 'Not A Real Module'].join('\n'),
      sources()
    );
    expect(outcome).toEqual({
      kind: 'fitting',
      source: 'text',
      fitting: { name: 'Rifter', shipTypeId: 587, modules: RIFTER_MODULES, drones: [], cargo: [] },
      unresolved: [{ line: 3, text: 'Not A Real Module', reason: 'unknown item' }],
    });
  });

  it('fails EFT text whose hull is unknown, without looking up a name', async () => {
    const src = sources();
    const outcome = await loadText('[Not A Ship, Fit]', src);
    expect(outcome).toMatchObject({
      kind: 'failed',
      error: null,
      unresolved: [{ text: 'Not A Ship', reason: 'unknown ship' }],
    });
    expect(src.hullName).not.toHaveBeenCalled();
  });

  it('opens a DNA string', async () => {
    const outcome = await loadText('587:484;1::', sources());
    expect(outcome).toMatchObject({ kind: 'fitting', fitting: { modules: RIFTER_MODULES } });
  });

  it('reads a killmail link that carries its hash without looking the hash up', async () => {
    const src = sources();
    const outcome = await loadText(`https://esi.evetech.net/latest/killmails/123/${HASH}/`, src);
    expect(src.killmailHash).not.toHaveBeenCalled();
    expect(src.killmailVictim).toHaveBeenCalledWith(123, HASH);
    expect(outcome).toMatchObject({ kind: 'fitting', fitting: { modules: RIFTER_MODULES } });
  });

  it("looks up a zKillboard link's hash, and reports a killmail zKillboard doesn't know", async () => {
    const src = sources({ killmailHash: vi.fn(async () => null) });
    const outcome = await loadText('https://zkillboard.com/kill/123/', src);
    expect(src.killmailHash).toHaveBeenCalledWith(123);
    expect(src.killmailVictim).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      kind: 'failed',
      source: 'text',
      error: 'killmail-not-found',
      unresolved: [],
    });
  });

  it('reports a killmail ESI returned nothing for, or failed to fetch', async () => {
    const empty = await loadText(
      'https://zkillboard.com/kill/123/',
      sources({ killmailVictim: vi.fn(async () => null) })
    );
    expect(empty).toMatchObject({ kind: 'failed', error: 'killmail-failed' });

    const thrown = await loadText(
      'https://zkillboard.com/kill/123/',
      sources({
        killmailVictim: vi.fn(async () => {
          throw new Error('ESI down');
        }),
      })
    );
    expect(thrown).toMatchObject({ kind: 'failed', error: 'killmail-failed' });
  });
});
