import { describe, it, expect } from 'vitest';
import { recordAlertsOutcome, recordOutcome, startRun } from '@/engine/corpTaxBook/addCorpsRun';
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

  it('round-trips the chained alerts step and drops a malformed one', () => {
    const run = recordOutcome(
      startRun({ collectorCorporationId: 9, editorCharacterId: 5, queue, alertsFor: [11] }),
      { kind: 'connected' }
    );
    expect(parseAddCorpsRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
    const ended = recordAlertsOutcome(run, { kind: 'on' });
    expect(parseAddCorpsRun(JSON.parse(JSON.stringify(ended)))).toEqual(ended);
    expect(
      parseAddCorpsRun({ ...run, alertsStep: { corporationId: 77 } })?.alertsStep
    ).toBeUndefined();
  });
});
