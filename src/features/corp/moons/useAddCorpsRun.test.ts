import { describe, it, expect } from 'vitest';
import { startRun, recordOutcome } from '@/engine/corpTaxBook/addCorpsRun';
import { parseAddCorpsRun } from './useAddCorpsRun';

const queue = [{ corporationId: 1, ceoCharacterId: 11, name: 'A', ceoName: 'P' }];

describe('parseAddCorpsRun', () => {
  it('round-trips a run through JSON, outcomes included', () => {
    const run = recordOutcome(
      startRun({
        collectorCorporationId: 9,
        editorCharacterId: 5,
        queue,
        coverageFrom: '2026-10-01',
      }),
      { kind: 'refused', reason: 'not-an-accountant' }
    );
    expect(parseAddCorpsRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
  });

  it('rejects junk and clamps a wild index', () => {
    expect(parseAddCorpsRun('x')).toBeNull();
    expect(parseAddCorpsRun({ collectorCorporationId: 9 })).toBeNull();
    const run = startRun({ collectorCorporationId: 9, editorCharacterId: 5, queue });
    expect(parseAddCorpsRun({ ...run, index: 99 })?.index).toBe(1);
  });
});
