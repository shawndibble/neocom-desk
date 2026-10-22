import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: { name: string; data: unknown }[] = [];
const signedIn: number[] = [];
let failNext = false;

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => async (data: unknown) => {
    if (failNext) {
      failNext = false;
      throw new Error('offline');
    }
    const { action, data: inner } = data as { action: string; data: unknown };
    sent.push({ name: `${name}:${action}`, data: inner });
    return { data: { ok: true } };
  },
}));
vi.mock('@/sync/firebaseApp', () => ({
  getSyncFunctions: () => ({}),
  getSyncFirestore: () => ({}),
}));
vi.mock('@/sync/syncAuth', () => ({
  ensureSignedIn: async (id: number) => {
    signedIn.push(id);
    return `char:${id}`;
  },
}));
vi.mock('@/features/communities/pledgeWrites', () => ({
  underFirebaseSession: <T>(fn: () => Promise<T>) => fn(),
}));

const { teachRefinerySystems } = await import('./corpBookStore');

const BOOK = 98000001;
const FEEDER = 98000002;
const TATARA = 1_000_000_000_002;
const ore = [{ typeId: 45490, quantity: 700 }];
const observed = (characterId: number) => ({
  characterId,
  recordedCorporationId: FEEDER,
  structureId: TATARA,
  date: '2026-10-01',
  sourceCorporationId: FEEDER,
  oreLines: ore,
});
const own = (characterId: number) => ({
  characterId,
  date: '2026-10-01',
  solarSystemId: 30002187,
  oreLines: ore,
});

describe('teachRefinerySystems (#4650)', () => {
  beforeEach(() => {
    sent.length = 0;
    signedIn.length = 0;
  });

  it('reports what each Character’s own ledger placed, under that Character, once', async () => {
    const book = {
      corporationId: BOOK,
      characterIds: [90000001, 90000002],
      observed: [observed(90000002)],
    };
    await teachRefinerySystems([book], [own(90000001), own(90000002)]);
    expect(signedIn).toEqual([90000002]);
    expect(sent).toEqual([
      {
        name: 'corpTaxBookCall:learnCorpTaxBookRefinerySystemsCallable',
        data: { corporationId: BOOK, systems: { [String(TATARA)]: 30002187 } },
      },
    ]);
    await teachRefinerySystems([book], [own(90000002)]);
    expect(sent).toHaveLength(1);
  });

  it('never throws, and tries again after a failed call', async () => {
    const book = {
      corporationId: BOOK + 1,
      characterIds: [90000003],
      observed: [observed(90000003)],
    };
    failNext = true;
    await expect(teachRefinerySystems([book], [own(90000003)])).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
    await teachRefinerySystems([book], [own(90000003)]);
    expect(sent).toHaveLength(1);
  });
});
