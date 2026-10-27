import { describe, expect, it } from 'vitest';
import type { TypeMap } from '@/sde/types';
import { buildHullCatalog } from './hullCatalog';
import { buildHullRuleRows, listedClassIds, listedHullIds } from './hullRuleRows';
import { NO_RULE, ruleKey, type SrpSettingsForm } from './srpSettingsForm';

const types: TypeMap = {
  '1': { name: 'Thorax', groupID: 26, volume: 1 },
  '2': { name: 'Vexor', groupID: 26, volume: 1 },
  '3': { name: 'Rifter', groupID: 25, volume: 1 },
};
const catalog = buildHullCatalog(types, { '25': 6, '26': 6 });
const names: Record<number, string> = { 25: 'Frigate', 26: 'Cruiser' };
const form = (rules: SrpSettingsForm['rules']): SrpSettingsForm => ({
  enabled: true,
  killmailPct: '',
  appraisalPct: '',
  windowDays: '30',
  requireFleetOrFc: false,
  rules,
});

describe('hullRuleRows', () => {
  it('lists hulls that carry a rule or were added, and ignores No rule and unknown ids', () => {
    const f = form({
      [ruleKey('hull', 1)]: { kind: 'not-covered', isk: '', doctrineIds: [] },
      [ruleKey('hull', 3)]: NO_RULE,
      [ruleKey('hull', 99)]: { kind: 'officer-decides', isk: '', doctrineIds: [] },
    });
    expect([...listedHullIds(f, catalog, [2])].sort()).toEqual([1, 2]);
  });

  it('collapsed classes come first by name with a hull count; expanded ones show their hulls', () => {
    const listed = new Set([1, 2]);
    const collapsed = buildHullRuleRows(
      catalog,
      (id) => names[id]!,
      listed,
      new Set(),
      new Set([25])
    );
    expect(collapsed.map((r) => [r.name, r.count])).toEqual([
      ['Cruiser', 2],
      ['Frigate', 0],
    ]);
    const open = buildHullRuleRows(
      catalog,
      (id) => names[id]!,
      listed,
      new Set([26]),
      new Set([25])
    );
    expect(open.map((r) => r.name)).toEqual(['Cruiser', 'Thorax', 'Vexor', 'Frigate']);
    expect(open[1]).toMatchObject({ scope: 'hull', id: 1, classId: 26 });
  });

  it('lists only classes that hold a listed hull or are listed themselves', () => {
    const rows = (listedClasses: number[]) =>
      buildHullRuleRows(
        catalog,
        (id) => names[id]!,
        new Set([1]),
        new Set(),
        new Set(listedClasses)
      );
    expect(rows([]).map((r) => r.name)).toEqual(['Cruiser']);
    expect(rows([25]).map((r) => r.name)).toEqual(['Cruiser', 'Frigate']);
    expect(buildHullRuleRows(catalog, (id) => names[id]!, new Set(), new Set()).length).toBe(0);
  });

  it('listedClassIds takes classes with a rule plus kept ones, not No rule or unknown ids', () => {
    const f = form({
      [ruleKey('class', 25)]: { kind: 'pay-percent', isk: '', doctrineIds: [] },
      [ruleKey('class', 26)]: NO_RULE,
      [ruleKey('class', 99)]: { kind: 'not-covered', isk: '', doctrineIds: [] },
      [ruleKey('hull', 1)]: { kind: 'not-covered', isk: '', doctrineIds: [] },
    });
    expect([...listedClassIds(f, catalog, [])]).toEqual([25]);
    expect([...listedClassIds(f, catalog, [26])].sort()).toEqual([25, 26]);
  });
});
