import { describe, expect, it } from 'vitest';
import { recordOutcome } from '@/engine/corpTaxBook/addCorpsRun';
import { connectedInRun, needsThePlayer, needsYou, stateOfOutcome } from './addCorpsStatus';
import { corpName, CORPS, freshRun } from './addCorpsFixtures';

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
    expect(connectedInRun(run)).toBe(1);
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
    const items = needsYou(null, rows, corpName, new Set([10, 12, 13, 15]));
    expect(items.map((i) => [i.corporationId, i.state])).toEqual([
      [10, 'needs-names'],
      [11, 'names-not-shared'],
      [14, 'names-not-shared'],
      [15, 'gone-quiet'],
    ]);
    expect(items.filter(needsThePlayer).map((i) => i.corporationId)).toEqual([10, 15]);
  });
});
