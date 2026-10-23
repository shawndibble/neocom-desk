import { describe, expect, it } from 'vitest';
import type { TypeMap } from '@/sde/types';
import { buildHullCatalog } from './hullCatalog';
import { buildHullRuleRows, listedHullIds } from './hullRuleRows';
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
      [ruleKey('hull', 1)]: { kind: 'not-covered', isk: '' },
      [ruleKey('hull', 3)]: NO_RULE,
      [ruleKey('hull', 99)]: { kind: 'officer-decides', isk: '' },
    });
    expect([...listedHullIds(f, catalog, [2])].sort()).toEqual([1, 2]);
  });

  it('collapsed classes come first by name with a hull count; expanded ones show their hulls', () => {
    const listed = new Set([1, 2]);
    const collapsed = buildHullRuleRows(catalog, (id) => names[id]!, listed, new Set());
    expect(collapsed.map((r) => [r.name, r.count])).toEqual([
      ['Cruiser', 2],
      ['Frigate', 0],
    ]);
    const open = buildHullRuleRows(catalog, (id) => names[id]!, listed, new Set([26]));
    expect(open.map((r) => r.name)).toEqual(['Cruiser', 'Thorax', 'Vexor', 'Frigate']);
    expect(open[1]).toMatchObject({ scope: 'hull', id: 1, classId: 26 });
  });
});
