import { describe, expect, it } from 'vitest';
import {
  MINER_LIST_DOC,
  OVERVIEW_DOC,
  READ_MODELS_SCHEMA,
  buildReadModels,
  movesReadModels,
  planReadModels,
} from './corpTaxBookReadModels.js';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const pull = (id: string, naturalDecayTime: string, extra: Record<string, unknown> = {}) => ({
  id,
  structureId: 1000,
  naturalDecayTime,
  ...extra,
});

describe('buildReadModels: the Overview’s Extractions and the Miners the book recorded', () => {
  it('lists the pulls not cancelled and expired no more than a day ago', () => {
    const live = pull('live', '2026-11-19T00:00:00Z');
    const models = buildReadModels(
      {
        expiryHours: {},
        extractions: [
          live,
          pull('gone', '2026-11-10T00:00:00Z'),
          pull('cancelled', '2026-11-19T00:00:00Z', { cancelledAt: '2026-11-18T00:00:00Z' }),
        ],
      },
      NOW
    );
    expect(models).toEqual({
      [OVERVIEW_DOC]: { schema: READ_MODELS_SCHEMA, extractions: [live] },
      [MINER_LIST_DOC]: { schema: READ_MODELS_SCHEMA, miners: [] },
    });
    expect(READ_MODELS_SCHEMA).toBe(2);
  });

  it('lists each Miner an officer’s visit recorded an account for, by id, sorted', () => {
    expect(
      buildReadModels({ expiryHours: {}, extractions: [], accountIds: ['solo:7', 'g1'] }, NOW)
        .minerList
    ).toEqual({ schema: READ_MODELS_SCHEMA, miners: [{ minerId: 'g1' }, { minerId: 'solo:7' }] });
  });

  it('keeps a pull its refinery’s own expiry still holds', () => {
    // Fractured on 17 Nov: the default 48 hours ran out on the 19th, a 72-hour expiry holds it.
    const late = pull('late', '2026-11-17T00:00:00Z');
    expect(
      buildReadModels({ expiryHours: {}, extractions: [late] }, NOW).overview.extractions
    ).toEqual([]);
    expect(
      buildReadModels({ expiryHours: { 1000: 72 }, extractions: [late] }, NOW).overview.extractions
    ).toEqual([late]);
  });
});

describe('planReadModels', () => {
  const fresh = buildReadModels({ expiryHours: {}, extractions: [], accountIds: ['g1'] }, NOW);
  const overview = { schema: READ_MODELS_SCHEMA, extractions: [] };
  const minerList = { schema: READ_MODELS_SCHEMA, miners: [{ minerId: 'g1' }] };

  it('writes a missing or changed doc, and leaves a current one', () => {
    expect(planReadModels(fresh, new Map()).writes).toEqual([
      { id: OVERVIEW_DOC, data: overview },
      { id: MINER_LIST_DOC, data: minerList },
    ]);
    const held = new Map<string, Record<string, unknown>>([
      [OVERVIEW_DOC, overview],
      [MINER_LIST_DOC, { schema: READ_MODELS_SCHEMA, miners: [] }],
    ]);
    expect(planReadModels(fresh, held)).toEqual({
      writes: [{ id: MINER_LIST_DOC, data: minerList }],
      mismatches: [{ id: MINER_LIST_DOC, kind: 'stale' }],
    });
  });
});

describe('movesReadModels', () => {
  it('rebuilds after an edit that moves an Extraction, its expiry or the Miners recorded', () => {
    for (const action of ['linkSurvey', 'setFullyMined', 'recordAccounts', 'regroupMiner'])
      expect(movesReadModels({ action })).toBe(true);
    expect(
      movesReadModels({ action: 'updateSettings', patch: { structureExpiryHours: { 1: 48 } } })
    ).toBe(true);
    for (const action of ['issueLateNotice', 'assignPayment', 'markNotTax'])
      expect(movesReadModels({ action })).toBe(false);
    expect(movesReadModels({ action: 'updateSettings', patch: { startDate: '2026-10-01' } })).toBe(
      false
    );
  });
});
