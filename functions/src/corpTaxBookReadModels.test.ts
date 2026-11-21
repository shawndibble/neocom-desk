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

describe('buildReadModels: the Overview’s Extractions, nothing else', () => {
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
    expect(models).toEqual({ [OVERVIEW_DOC]: { schema: READ_MODELS_SCHEMA, extractions: [live] } });
    expect(READ_MODELS_SCHEMA).toBe(2);
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
  const fresh = buildReadModels({ expiryHours: {}, extractions: [] }, NOW);

  it('writes a missing or changed Overview, and leaves a current one', () => {
    expect(planReadModels(fresh, new Map()).writes).toEqual([
      { id: OVERVIEW_DOC, data: { schema: READ_MODELS_SCHEMA, extractions: [] } },
    ]);
    const held = new Map([[OVERVIEW_DOC, { schema: READ_MODELS_SCHEMA, extractions: [] }]]);
    expect(planReadModels(fresh, held)).toEqual({ writes: [], deletes: [], mismatches: [] });
  });

  it('deletes the retired Miners list doc', () => {
    const held = new Map([
      [OVERVIEW_DOC, { schema: READ_MODELS_SCHEMA, extractions: [] }],
      [MINER_LIST_DOC, { schema: READ_MODELS_SCHEMA, miners: [] }],
    ]);
    expect(planReadModels(fresh, held)).toEqual({
      writes: [],
      deletes: [MINER_LIST_DOC],
      mismatches: [{ id: MINER_LIST_DOC, kind: 'retired' }],
    });
  });
});

describe('movesReadModels', () => {
  it('rebuilds after an edit that moves an Extraction or its expiry, and not otherwise', () => {
    for (const action of ['linkSurvey', 'setFullyMined'])
      expect(movesReadModels({ action })).toBe(true);
    expect(
      movesReadModels({ action: 'updateSettings', patch: { structureExpiryHours: { 1: 48 } } })
    ).toBe(true);
    for (const action of ['recordAccounts', 'issueLateNotice', 'assignPayment', 'regroupMiner'])
      expect(movesReadModels({ action })).toBe(false);
    expect(movesReadModels({ action: 'updateSettings', patch: { startDate: '2026-10-01' } })).toBe(
      false
    );
  });
});
