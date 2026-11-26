import { describe, expect, it } from 'vitest';
import { FACILITY_PRESETS, EMPTY_RIG_FIT } from '@/engine/industry/types';
import type { FacilityContext, IndustryBlueprint } from '@/engine/industry/types';
import { consumedByJobs, subtractJobConsumption, type StockJob } from './jobConsumedStock';
import type { DetectedOwnedStockMap } from './ownedStock';

const CTX: FacilityContext = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: EMPTY_RIG_FIT,
  security: 'highsec',
};
const FACILITY = 60003760;
const OTHER_FACILITY = 60008494;
const TRIT = 34;
const PYER = 35;
const BP = 1000;

const blueprint: IndustryBlueprint = {
  name: 'Test Blueprint',
  time: 100,
  materials: [
    { typeID: TRIT, quantity: 100 },
    { typeID: PYER, quantity: 10 },
  ],
  products: [{ typeID: 5, quantity: 1 }],
};
const blueprintFor = (id: number) => (id === BP ? blueprint : undefined);

const SNAPSHOT = 1_000_000;
const snapshots = new Map([[1, SNAPSHOT]]);

function job(overrides: Partial<StockJob> = {}): StockJob {
  return {
    jobId: 1,
    characterId: 1,
    activityId: 1,
    blueprintTypeId: BP,
    runs: 2,
    startMs: SNAPSHOT + 1,
    facilityId: FACILITY,
    me: 0,
    ...overrides,
  };
}

function stockOf(
  entries: Record<
    number,
    { characterId?: number; corporationId?: number; locationId?: number; quantity: number }[]
  >
): DetectedOwnedStockMap {
  const map: DetectedOwnedStockMap = new Map();
  for (const [typeID, placements] of Object.entries(entries)) {
    const ps = placements.map((p) => ({
      characterId: p.characterId ?? 1,
      corporationId: p.corporationId,
      locationId: p.locationId ?? FACILITY,
      locationType: 'station' as const,
      quantity: p.quantity,
    }));
    map.set(Number(typeID), { quantity: ps.reduce((s, p) => s + p.quantity, 0), placements: ps });
  }
  return map;
}

describe('consumedByJobs', () => {
  it('counts a job installed after the snapshot, with runs and ME from the job', () => {
    const out = consumedByJobs([job({ runs: 3, me: 10 })], snapshots, blueprintFor, CTX);
    expect(out.map((c) => [c.typeID, c.quantity])).toEqual([
      [TRIT, 270],
      [PYER, 27],
    ]);
    expect(out[0]).toMatchObject({
      jobId: 1,
      characterId: 1,
      facilityId: FACILITY,
      blueprintName: 'Test Blueprint',
    });
  });

  it('ignores a job started at or before the snapshot (already out of the assets)', () => {
    expect(consumedByJobs([job({ startMs: SNAPSHOT })], snapshots, blueprintFor, CTX)).toEqual([]);
    expect(consumedByJobs([job({ startMs: SNAPSHOT - 5 })], snapshots, blueprintFor, CTX)).toEqual(
      []
    );
  });

  it('ignores a job of a Character with no known snapshot time', () => {
    expect(consumedByJobs([job({ characterId: 2 })], snapshots, blueprintFor, CTX)).toEqual([]);
  });

  it('prices a reaction at base quantities whatever ME the caller passed', () => {
    const reaction = consumedByJobs(
      [job({ activityId: 11, me: 10 })],
      snapshots,
      blueprintFor,
      CTX
    );
    const base = consumedByJobs([job({ activityId: 11, me: 0 })], snapshots, blueprintFor, CTX);
    expect(reaction).toEqual(base);
  });

  it('only manufacturing (1) and reactions (11) consume stock this way', () => {
    expect(consumedByJobs([job({ activityId: 3 })], snapshots, blueprintFor, CTX)).toEqual([]);
    expect(consumedByJobs([job({ activityId: 11 })], snapshots, blueprintFor, CTX)).not.toEqual([]);
  });

  it('skips a job whose blueprint is unknown', () => {
    expect(consumedByJobs([job({ blueprintTypeId: 9 })], snapshots, blueprintFor, CTX)).toEqual([]);
  });
});

describe('subtractJobConsumption', () => {
  const consume = (
    over: Partial<{ quantity: number; facilityId: number; characterId: number }> = {}
  ) => ({
    jobId: 7,
    characterId: 1,
    facilityId: FACILITY,
    blueprintName: 'Test Blueprint',
    typeID: TRIT,
    quantity: 40,
    ...over,
  });

  it('reduces stock at the job facility and reports the reduction', () => {
    const { stock, reductions } = subtractJobConsumption(stockOf({ [TRIT]: [{ quantity: 100 }] }), [
      consume(),
    ]);
    expect(stock.get(TRIT)?.quantity).toBe(60);
    expect(stock.get(TRIT)?.placements[0].quantity).toBe(60);
    expect(reductions).toEqual([
      { jobId: 7, blueprintName: 'Test Blueprint', typeID: TRIT, quantity: 40 },
    ]);
  });

  it('floors at zero and drops the emptied entry', () => {
    const { stock, reductions } = subtractJobConsumption(stockOf({ [TRIT]: [{ quantity: 30 }] }), [
      consume(),
    ]);
    expect(stock.has(TRIT)).toBe(false);
    expect(reductions[0].quantity).toBe(30);
  });

  it('never subtracts from a different location', () => {
    const input = stockOf({ [TRIT]: [{ quantity: 100, locationId: OTHER_FACILITY }] });
    const { stock, reductions } = subtractJobConsumption(input, [consume()]);
    expect(stock.get(TRIT)?.quantity).toBe(100);
    expect(reductions).toEqual([]);
  });

  it('leaves corp-owned placements and other Characters alone', () => {
    const input = stockOf({
      [TRIT]: [
        { quantity: 50, corporationId: 99 },
        { quantity: 50, characterId: 2 },
      ],
    });
    const { stock, reductions } = subtractJobConsumption(input, [consume()]);
    expect(stock.get(TRIT)?.quantity).toBe(100);
    expect(reductions).toEqual([]);
  });

  it('does not mutate its input and returns it untouched with no consumption', () => {
    const input = stockOf({ [TRIT]: [{ quantity: 100 }] });
    expect(subtractJobConsumption(input, []).stock).toBe(input);
    subtractJobConsumption(input, [consume()]);
    expect(input.get(TRIT)?.quantity).toBe(100);
  });
});
