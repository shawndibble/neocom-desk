import { describe, expect, it } from 'vitest';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import type { BookFeeder } from '../taxBook/bookClient';
import { moonOwnerDebugDump } from './moonOwnerDebugDump';

describe('moonOwnerDebugDump', () => {
  it('reports why a moon owner is stale without any name or token', () => {
    const feeder = {
      corporationId: 98000001,
      status: 'active',
      sameOwner: true,
      joinedAt: Date.parse('2026-11-22T20:00:00Z'),
      lastReadWellAt: '2026-11-22T21:00:00.000Z',
      staleSince: Date.parse('2026-11-23T05:00:00Z'),
      lastSyncResult: {
        at: Date.parse('2026-11-23T05:00:00Z'),
        outcome: 'stale',
        reason: 'no-grant',
      },
    } as unknown as BookFeeder;
    const dump = moonOwnerDebugDump(
      98000000,
      [feeder],
      [{ corporationId: 98000001, status: 'cant-read', sameOwner: true } as MoonOwnerRow],
      Date.parse('2026-11-23T08:00:00Z')
    );
    expect(dump.owners[0]).toMatchObject({
      corporationId: 98000001,
      shownAs: 'cant-read',
      goneQuiet: true,
      staleSince: '2026-11-23T05:00:00.000Z',
      lastSyncOutcome: 'stale',
      lastSyncReason: 'no-grant',
      lastReadWellAt: '2026-11-22T21:00:00.000Z',
    });
  });
});
