import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import { changeVerdict, NUMERIC_FIELDS } from './fittingStatFields';
import { swapChanges } from './swapChanges';
import { baseFittingStats } from './__fixtures__/fittingStats';
import type { SupportRow } from './support';
import type { FittingStats } from './types';

const row = (over: Partial<SupportRow>): SupportRow => ({
  kind: 'warpDisruption',
  typeId: 1,
  count: 1,
  amount: 1,
  optimal: 20_000,
  falloff: 0,
  effects: [],
  ...over,
});

const withRows = (s: FittingStats, rows: SupportRow[]): FittingStats => ({
  ...s,
  support: { ...s.support, rows },
});

const keys = (before: FittingStats, after: FittingStats) =>
  swapChanges(before, after).map((change) => change.change.key);

describe('swapChanges', () => {
  it('names a hacking strength and coherence loss (Zeugma → Ligature)', () => {
    const before = baseFittingStats();
    const analyzer = (strength: number, coherence: number): FittingStats['explore'] => ({
      modules: 1,
      hacking: { strength, coherence, cycleSeconds: 10 },
      analyzers: [{ strength, coherence, cycleSeconds: 10 }],
      scanning: { strength: 0, duration: 0, deviation: 0 },
    });
    const changes = swapChanges(
      { ...before, explore: analyzer(30, 30) },
      { ...before, explore: analyzer(20, 20) }
    );
    expect(changes).toContainEqual({
      kind: 'stat',
      change: { key: 'hackingStrength', before: 30, after: 20 },
    });
    expect(changes).toContainEqual({
      kind: 'stat',
      change: { key: 'virusCoherence', before: 30, after: 20 },
    });
  });

  it('names a point, a web and their reach', () => {
    const base = baseFittingStats();
    const before = withRows(base, [
      row({ amount: 2, optimal: 9_000 }),
      row({ kind: 'web', amount: 60, optimal: 14_000 }),
    ]);
    const after = withRows(base, [
      row({ amount: 1, optimal: 7_500 }),
      row({ kind: 'web', amount: 50, optimal: 10_000 }),
    ]);
    expect(keys(before, after)).toEqual(
      expect.arrayContaining(['tacklePoints', 'webStrength', 'pointRange', 'webRange'])
    );
  });

  it('does not read an added shorter-range point as lost reach', () => {
    const base = baseFittingStats();
    const before = withRows(base, [row({ amount: 1, optimal: 24_000 })]);
    const after = withRows(base, [
      row({ amount: 1, optimal: 24_000 }),
      row({ kind: 'web', amount: 60, optimal: 10_000 }),
    ]);
    expect(keys(before, after)).not.toContain('pointRange');
  });

  it('compares EWAR per kind: a damp → ECM swap is not "strength 30 → 5"', () => {
    const base = baseFittingStats();
    const before = withRows(base, [row({ kind: 'sensorDampener', amount: 30 })]);
    const after = withRows(base, [row({ kind: 'ecm', amount: 5 })]);
    const changes = swapChanges(before, after).map(({ change }) => change);
    expect(changes).toContainEqual({ key: 'dampStrength', before: 30, after: 0 });
    expect(changes).toContainEqual({ key: 'ecmStrength', before: 0, after: 5 });
  });

  it('counts a first analyzer cycle or miner residue as neither better nor worse', () => {
    const base = baseFittingStats();
    const after: FittingStats = {
      ...base,
      mining: { ...base.mining, wastePct: 10 },
      explore: {
        ...base.explore,
        modules: 1,
        hacking: { strength: 30, coherence: 60, cycleSeconds: 10 },
      },
    };
    const verdicts = swapChanges(base, after)
      .filter(({ change }) => change.key === 'miningWaste' || change.key === 'hackingCycle')
      .map(({ change }) => changeVerdict(change));
    expect(verdicts).toEqual(['neutral', 'neutral']);
  });

  it('names neut, nos and cap transfer amounts and a damp strength', () => {
    const base = baseFittingStats();
    const before: FittingStats = {
      ...withRows(base, [row({ kind: 'sensorDampener', amount: 30, optimal: 30_000 })]),
      support: {
        ...base.support,
        rows: [row({ kind: 'sensorDampener', amount: 30, optimal: 30_000 })],
        neutralizer: 20,
        nosferatu: 8,
        capTransfer: 30,
      },
    };
    const after: FittingStats = {
      ...before,
      support: {
        ...before.support,
        rows: [row({ kind: 'sensorDampener', amount: 25, optimal: 30_000 })],
        neutralizer: 15,
        nosferatu: 6,
        capTransfer: 25,
      },
    };
    expect(keys(before, after)).toEqual(
      expect.arrayContaining(['neutralizer', 'nosferatu', 'capTransfer', 'dampStrength'])
    );
  });

  it('names drone control range, sensor strength and mining residue', () => {
    const before = baseFittingStats();
    const after: FittingStats = {
      ...before,
      applied: { ...before.applied, droneControlRange: 24_000 },
      sensor: { ...before.sensor, strength: before.sensor.strength + 4 },
      mining: { ...before.mining, wastePct: before.mining.wastePct + 5 },
    };
    expect(keys(before, after)).toEqual(
      expect.arrayContaining(['droneControlRange', 'sensorStrength', 'miningWaste'])
    );
  });

  it('carries the role stats too: remote repair', () => {
    const before = baseFittingStats();
    const after: FittingStats = {
      ...before,
      support: {
        ...before.support,
        remoteRepair: { shield: 40, armor: 0, hull: 0 },
      },
    };
    expect(swapChanges(before, after)).toContainEqual({
      kind: 'role',
      change: { key: 'remoteRepair', before: 0, after: 40 },
    });
  });

  it('lists nothing a fit without the role keeps at zero, and nothing twice', () => {
    const before = baseFittingStats();
    const after: FittingStats = { ...before, cpuUsed: before.cpuUsed + 5 };
    expect(keys(before, after)).toEqual(['cpuUsed']);
  });

  it('has a Variations and a Compare label for every stat it can list', () => {
    const missing = NUMERIC_FIELDS.flatMap(({ key }) => [
      ...(key in en.fittings.variations.stat ? [] : [`variations.${key}`]),
      ...(key in en.fittings.compare.stat ? [] : [`compare.${key}`]),
    ]);
    expect(missing).toEqual([]);
  });
});
