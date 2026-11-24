import { describe, expect, it } from 'vitest';
import { recordOutcome } from '@/engine/corpTaxBook/addCorpsRun';
import {
  connectedInRun,
  needsThePlayer,
  needsYou,
  offersLoginAgain,
  stateOfOutcome,
} from './addCorpsStatus';
import { corpName, CORPS, freshRun } from './addCorpsFixtures';

/** Own corps the player is CEO of, each with its CEO's name. */
const ceos = (...ids: number[]) => new Map(ids.map((id) => [id, `CEO ${id}`]));

describe('stateOfOutcome', () => {
  it('maps every outcome to a state', () => {
    expect(stateOfOutcome(undefined)).toBe('ready');
    expect(stateOfOutcome({ kind: 'connected' })).toBe('connected');
    expect(stateOfOutcome({ kind: 'skipped' })).toBe('needs-sign-in');
    expect(stateOfOutcome({ kind: 'cancelled' })).toBe('needs-sign-in');
    expect(stateOfOutcome({ kind: 'wrong-character', signedInAs: 'X' })).toBe('needs-sign-in');
    expect(stateOfOutcome({ kind: 'refused', reason: 'not-an-accountant' })).toBe('needs-role');
    expect(stateOfOutcome({ kind: 'refused', reason: 'own-book-exists' })).toBe('own-book');
    expect(stateOfOutcome({ kind: 'refused', reason: 'already-feeder' })).toBe('connected');
    expect(stateOfOutcome({ kind: 'refused', reason: 'ledger-unavailable' })).toBe('failed');
    // A server that failed or does not know the action is not "log in again".
    expect(stateOfOutcome({ kind: 'refused', reason: 'unknown' })).toBe('failed');
    expect(stateOfOutcome({ kind: 'refused', reason: 'wrong-corp' })).toBe('needs-sign-in');
  });
});

describe('needsYou', () => {
  it('lists run problems and the own moon owners that went quiet, never a corp the book reads', () => {
    let run = freshRun();
    run = recordOutcome(run, { kind: 'connected' });
    run = recordOutcome(run, { kind: 'refused', reason: 'not-an-accountant' });
    run = recordOutcome(run, { kind: 'refused', reason: 'own-book-exists' });
    run = recordOutcome(run, { kind: 'skipped' });
    run = recordOutcome(run, { kind: 'cancelled' });
    const rows = [
      { corporationId: CORPS[4]!.corporationId, status: 'active' }, // since connected
      { corporationId: 99, status: 'cant-read', sameOwner: true },
      { corporationId: 98, status: 'cant-read' }, // not the player's own: existing flow
    ];
    const items = needsYou(run, rows, corpName);
    expect(items.map((i) => [i.corporationId, i.state])).toEqual([
      [CORPS[1]!.corporationId, 'needs-role'],
      [CORPS[2]!.corporationId, 'own-book'],
      [CORPS[3]!.corporationId, 'needs-sign-in'],
      [99, 'gone-quiet'],
    ]);
    // A run corp whose fix is logging in again names the CEO to log in as; one that
    // needs no login (its own book) or went quiet names no one.
    expect(items.map((i) => i.ceoName)).toEqual([
      CORPS[1]!.ceoName,
      undefined,
      CORPS[3]!.ceoName,
      undefined,
    ]);
    expect(connectedInRun(run)).toBe(1);
  });

  it('names no CEO on a run corp whose CEO changed: that character is the wrong login', () => {
    const run = recordOutcome(freshRun(), { kind: 'refused', reason: 'ceo-changed' });
    const [item] = needsYou(run, [], corpName);
    expect(item?.state).toBe('failed');
    expect(item).not.toHaveProperty('ceoName');
  });

  it('is empty with no run and nothing quiet', () => {
    expect(
      needsYou(null, [{ corporationId: 1, status: 'active', sameOwner: true }], corpName)
    ).toEqual([]);
  });

  it('asks for Grant again where names are not read: own corps act, others only inform', () => {
    const rows = [
      {
        corporationId: 10,
        status: 'settled-otherwise',
        sameOwner: true,
        readsStructureNames: false,
      },
      { corporationId: 11, status: 'active', readsStructureNames: false },
      // Not yet synced, or already granted: nothing to ask.
      { corporationId: 12, status: 'settled-otherwise', sameOwner: true },
      {
        corporationId: 13,
        status: 'settled-otherwise',
        sameOwner: true,
        readsStructureNames: true,
      },
      // Own corp the player cannot sign in for (no CEO character): only its officer can.
      {
        corporationId: 14,
        status: 'settled-otherwise',
        sameOwner: true,
        readsStructureNames: false,
      },
      // Gone quiet wins over names; a removal in progress is not asked about.
      { corporationId: 15, status: 'cant-read', sameOwner: true, readsStructureNames: false },
      { corporationId: 16, status: 'removal-pending', readsStructureNames: false },
    ];
    const items = needsYou(null, rows, corpName, ceos(10, 12, 13, 15));
    expect(items.map((i) => [i.corporationId, i.state])).toEqual([
      [10, 'needs-names'],
      [11, 'names-not-shared'],
      [14, 'names-not-shared'],
      [15, 'gone-quiet'],
    ]);
    expect(items.filter(needsThePlayer).map((i) => i.corporationId)).toEqual([10, 15]);
    // Grant again names the CEO to log in as; another officer's corp has none to name.
    expect(items.find((i) => i.corporationId === 10)?.ceoName).toBe('CEO 10');
    expect(items.find((i) => i.corporationId === 11)).not.toHaveProperty('ceoName');
  });

  it('names the CEO to log in as for an own corp that went quiet, when the player leads it', () => {
    const quiet = { status: 'cant-read', sameOwner: true };
    const rows = [
      { ...quiet, corporationId: 30 },
      // The player has no CEO character for it: only Remove, no login to offer.
      { ...quiet, corporationId: 31 },
      { ...quiet, corporationId: 32, status: 'disconnected' },
    ];
    const items = needsYou(null, rows, corpName, ceos(30, 32));
    expect(items.map((i) => [i.corporationId, i.state, i.ceoName])).toEqual([
      [30, 'gone-quiet', 'CEO 30'],
      [31, 'gone-quiet', undefined],
      [32, 'gone-quiet', 'CEO 32'],
    ]);
    expect(items.map(offersLoginAgain)).toEqual([true, false, true]);
  });

  it('asks an own corp whose grant reads no Extraction notices to grant again for the ore', () => {
    const own = { status: 'active', sameOwner: true, readsStructureNames: true };
    const rows = [
      { ...own, corporationId: 20, readsNotifications: false },
      // Names lacking too: the one Grant again covers both, listed once as names.
      { ...own, corporationId: 21, readsStructureNames: false, readsNotifications: false },
      // Unknown until its next read, or already granted: nothing to ask.
      { ...own, corporationId: 22 },
      { ...own, corporationId: 23, readsNotifications: true },
      // Not the player's to grant (another officer's, or no CEO character): the chunks say why.
      { corporationId: 24, status: 'active', readsNotifications: false },
      { ...own, corporationId: 25, readsNotifications: false },
      // A removal in progress is not asked about.
      { ...own, corporationId: 26, status: 'removal-pending', readsNotifications: false },
    ];
    const items = needsYou(null, rows, corpName, ceos(20, 21, 22, 23, 26));
    expect(items.map((i) => [i.corporationId, i.state])).toEqual([
      [20, 'needs-ore'],
      [21, 'needs-names'],
    ]);
    expect(items.every(needsThePlayer)).toBe(true);
    expect(items.find((i) => i.corporationId === 21)?.alsoOre).toBe(true);
    expect(items.find((i) => i.corporationId === 20)).not.toHaveProperty('alsoOre');
    expect(items.map((i) => i.ceoName)).toEqual(['CEO 20', 'CEO 21']);
  });
});
