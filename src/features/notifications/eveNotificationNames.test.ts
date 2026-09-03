import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EveNotificationFire } from '@/engine/notificationDiffs';

const loadStructureName =
  vi.fn<(characterId: number, structureId: number) => Promise<string | null>>();
const resolveNames = vi.fn<(ids: readonly number[]) => Promise<Map<number, string>>>();

vi.mock('@/features/character/structures', () => ({
  loadStructureName: (characterId: number, structureId: number) =>
    loadStructureName(characterId, structureId),
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: (ids: readonly number[]) => resolveNames(ids),
}));

const { resolveEveNotificationNames } = await import('./eveNotificationNames');

/**
 * Resolution is memoized per notification id, so every test that expects a
 * fresh lookup needs its own id — the same discipline the real feed gets for
 * free from ESI's monotonic ids.
 */
let nextNotificationId = 1;

function fire(overrides: Partial<EveNotificationFire> = {}): EveNotificationFire {
  return {
    eventId: 'eveNotification',
    characterId: 2114794365,
    notificationId: nextNotificationId++,
    type: 'StructureFuelAlert',
    senderId: 1000132,
    senderType: 'corporation',
    text: 'structureID: &id001 1000000000001\nstructureTypeID: 35835\n',
    timestamp: '2026-09-03T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  loadStructureName.mockReset();
  resolveNames.mockReset();
  loadStructureName.mockResolvedValue(null);
  resolveNames.mockResolvedValue(new Map());
});

describe('resolveEveNotificationNames — failures never reach the caller', () => {
  it('returns an empty result when the structure lookup rejects', async () => {
    loadStructureName.mockRejectedValue(new Error('403 Forbidden: not on the ACL'));
    await expect(resolveEveNotificationNames(fire())).resolves.toEqual({});
  });

  it('returns an empty result when the bulk name lookup rejects', async () => {
    resolveNames.mockRejectedValue(new Error('Dexie is blocked'));
    await expect(
      resolveEveNotificationNames(fire({ type: 'CorpAppNewMsg', text: 'charID: 1011\n' }))
    ).resolves.toEqual({});
  });

  it('keeps the structure name when only the entity lookup fails', async () => {
    loadStructureName.mockResolvedValue("Athanor 'Chunk Line 3'");
    resolveNames.mockRejectedValue(new Error('offline'));
    const names = await resolveEveNotificationNames(
      fire({
        type: 'StructureUnderAttack',
        text: 'charID: 1011\nstructureID: &id001 1000000000001\n',
      })
    );
    expect(names.structure).toBe("Athanor 'Chunk Line 3'");
    expect(names.entities).toBeUndefined();
  });

  it('returns an empty result for an unparseable payload without calling ESI', async () => {
    const names = await resolveEveNotificationNames(
      fire({ type: 'StructureFuelAlert', text: 'not a mapping at all' })
    );
    expect(names).toEqual({});
    expect(loadStructureName).not.toHaveBeenCalled();
  });

  it('omits a structure the character cannot see rather than inventing one', async () => {
    loadStructureName.mockResolvedValue(null);
    await expect(resolveEveNotificationNames(fire())).resolves.toEqual({});
  });
});

describe('resolveEveNotificationNames — only looks up what a body will use', () => {
  it('does nothing at all for a type that renders generically', async () => {
    const names = await resolveEveNotificationNames(
      fire({ type: 'SomeBrandNewMsgType6041', text: 'structureID: 1000000000001\ncharID: 1011\n' })
    );
    expect(names).toEqual({});
    expect(loadStructureName).not.toHaveBeenCalled();
    expect(resolveNames).not.toHaveBeenCalled();
  });

  it('resolves the structure id against the character that received the notification', async () => {
    loadStructureName.mockResolvedValue("Athanor 'Chunk Line 3'");
    const names = await resolveEveNotificationNames(fire());
    expect(loadStructureName).toHaveBeenCalledWith(2114794365, 1_000_000_000_001);
    expect(names.structure).toBe("Athanor 'Chunk Line 3'");
  });

  it('skips the structure lookup when the payload already spells the name out', async () => {
    const names = await resolveEveNotificationNames(
      fire({
        type: 'MoonminingExtractionFinished',
        text: 'structureID: 1000000000002\nstructureName: Chunk Line 3\n',
      })
    );
    expect(loadStructureName).not.toHaveBeenCalled();
    expect(names).toEqual({});
  });

  it('resolves the war aggressor', async () => {
    resolveNames.mockResolvedValue(new Map([[3011, 'Big Bad Alliance']]));
    const names = await resolveEveNotificationNames(
      fire({ type: 'WarDeclared', text: 'againstID: 3001\ndeclaredByID: 3011\n' })
    );
    expect(resolveNames).toHaveBeenCalledWith([3011]);
    expect(names.entities?.get(3011)).toBe('Big Bad Alliance');
  });

  it('resolves the corp applicant', async () => {
    resolveNames.mockResolvedValue(new Map([[1011, 'Hopeful Recruit']]));
    const names = await resolveEveNotificationNames(
      fire({ type: 'CorpAppNewMsg', text: 'applicationText: hi\ncharID: 1011\ncorpID: 2001\n' })
    );
    expect(resolveNames).toHaveBeenCalledWith([1011]);
    expect(names.entities?.get(1011)).toBe('Hopeful Recruit');
  });

  it('skips the aggressor lookup on StructureUnderAttack when CCP already named the corporation', async () => {
    const names = await resolveEveNotificationNames(
      fire({
        type: 'StructureUnderAttack',
        text: 'charID: 1011\ncorpName: Bad Company\nstructureID: &id001 1000000000001\n',
      })
    );
    expect(resolveNames).not.toHaveBeenCalled();
    expect(names.entities).toBeUndefined();
  });

  it('resolves the attacking pilot only when the payload names no corporation or alliance', async () => {
    resolveNames.mockResolvedValue(new Map([[1011, 'Bad Pilot']]));
    const names = await resolveEveNotificationNames(
      fire({
        type: 'StructureUnderAttack',
        text: 'charID: 1011\nstructureID: &id001 1000000000001\n',
      })
    );
    expect(resolveNames).toHaveBeenCalledWith([1011]);
    expect(names.entities?.get(1011)).toBe('Bad Pilot');
  });
});

/**
 * Issue #300's "name resolution must not block the notification" — the rule
 * that a caught rejection alone does not satisfy, because a lookup that simply
 * never settles delays the alert just as effectively as one that throws.
 */
describe('resolveEveNotificationNames — a slow lookup cannot hold the notification back', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives up on a structure lookup that never settles and renders without the name', async () => {
    loadStructureName.mockReturnValue(new Promise<string | null>(() => {}));
    const pending = resolveEveNotificationNames(fire());
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toEqual({});
  });

  it('gives up on a hung entity lookup too', async () => {
    resolveNames.mockReturnValue(new Promise<Map<number, string>>(() => {}));
    const pending = resolveEveNotificationNames(
      fire({ type: 'CorpAppNewMsg', text: 'charID: 1011\n' })
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toEqual({});
  });

  it('still returns a lookup that settles inside the budget', async () => {
    loadStructureName.mockReturnValue(
      new Promise<string | null>((resolve) => setTimeout(() => resolve('Chunk Line 3'), 100))
    );
    const pending = resolveEveNotificationNames(fire());
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toEqual({ structure: 'Chunk Line 3' });
  });
});

describe('resolveEveNotificationNames — the second render of a fire costs no second round-trip', () => {
  it('reuses the first resolution for the same notification id', async () => {
    resolveNames.mockResolvedValue(new Map([[1011, 'Hopeful Recruit']]));
    const applicant = fire({
      type: 'CorpAppNewMsg',
      text: 'applicationText: hi\ncharID: 1011\ncorpID: 2001\n',
    });
    // `notificationText` renders twice per fire: once for the browser
    // notification, once for the Notification Feed entry.
    const [browser, feed] = await Promise.all([
      resolveEveNotificationNames(applicant),
      resolveEveNotificationNames(applicant),
    ]);
    expect(resolveNames).toHaveBeenCalledTimes(1);
    expect(browser.entities?.get(1011)).toBe('Hopeful Recruit');
    expect(feed).toEqual(browser);
  });

  it('does not confuse two different notifications', async () => {
    loadStructureName.mockResolvedValueOnce('First Refinery');
    loadStructureName.mockResolvedValueOnce('Second Refinery');
    const first = await resolveEveNotificationNames(fire());
    const second = await resolveEveNotificationNames(fire());
    expect(first.structure).toBe('First Refinery');
    expect(second.structure).toBe('Second Refinery');
  });
});
