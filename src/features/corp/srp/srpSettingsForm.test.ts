import { describe, expect, it } from 'vitest';
import type { SrpSettings } from '../srpTypes';
import {
  formFromSettings,
  formIsDirty,
  formProblems,
  formToPatch,
  ruleKey,
  ruleOf,
  setDoctrineIds,
  setRule,
} from './srpSettingsForm';

const saved: SrpSettings = {
  corporationId: 98,
  enabled: true,
  killmailPct: 70,
  appraisalPct: null,
  hullRules: [
    { scope: 'class', id: 27, kind: 'pay-fixed', iskAmount: 180_000_000 },
    { scope: 'hull', id: 641, kind: 'not-covered' },
    { scope: 'class', id: 26, kind: 'pay-percent' },
  ],
  windowDays: 30,
  requireFleetOrFc: false,
  createdBy: 1,
  createdAt: 1,
  ownerCharacterId: 1,
  updatedAt: 1,
  updatedBy: 1,
};

describe('srpSettingsForm', () => {
  it('round-trips saved settings without a change', () => {
    const form = formFromSettings(saved);
    expect(form.killmailPct).toBe('70');
    expect(form.appraisalPct).toBe('');
    expect(form.rules[ruleKey('class', 27)]).toEqual({
      kind: 'pay-fixed',
      isk: '180000000',
      doctrineIds: [],
    });
    expect(formIsDirty(form, saved)).toBe(false);
    expect(formToPatch(form, saved)).toEqual({});
  });

  it('patches only the fields that changed', () => {
    const form = { ...formFromSettings(saved), windowDays: '45', appraisalPct: '60' };
    expect(formIsDirty(form, saved)).toBe(true);
    expect(formToPatch(form, saved)).toEqual({ windowDays: 45, appraisalPct: 60 });
  });

  it('a blank percent clears it to null', () => {
    const form = { ...formFromSettings(saved), killmailPct: '', appraisalPct: '50' };
    const patch = formToPatch(form, saved);
    expect(patch.killmailPct).toBeNull();
    expect(patch.appraisalPct).toBe(50);
  });

  it('sends the whole rule list when a rule changes, dropping No rule', () => {
    const form = setRule(formFromSettings(saved), 'hull', 641, {
      kind: 'none',
      isk: '',
      doctrineIds: [],
    });
    const patch = formToPatch(form, saved);
    expect(patch.hullRules).toEqual([
      { scope: 'class', id: 26, kind: 'pay-percent' },
      { scope: 'class', id: 27, kind: 'pay-fixed', iskAmount: 180_000_000 },
    ]);
  });

  it('pay-percent rules carry no figure of their own, whatever the corp percents', () => {
    const base = formFromSettings(saved);
    const form = setRule({ ...base, killmailPct: '', appraisalPct: '55' }, 'hull', 5, {
      kind: 'pay-percent',
      isk: '',
      doctrineIds: [],
    });
    const rules = formToPatch(form, saved).hullRules ?? [];
    expect(rules.filter((r) => r.kind === 'pay-percent')).toEqual([
      { scope: 'class', id: 26, kind: 'pay-percent' },
      { scope: 'hull', id: 5, kind: 'pay-percent' },
    ]);
  });

  it('a stored legacy pct never reads as an edit', () => {
    const legacy = {
      ...saved,
      hullRules: [{ scope: 'class', id: 26, kind: 'pay-percent', pct: 70 }],
    } as unknown as SrpSettings;
    expect(formToPatch(formFromSettings(legacy), legacy)).toEqual({});
  });

  it('reports bad percents, a blank fixed price, a bad window and a percent rule with no percent', () => {
    let form = formFromSettings(saved);
    form = { ...form, killmailPct: '0', appraisalPct: '101', windowDays: '400' };
    form = setRule(form, 'hull', 9, { kind: 'pay-fixed', isk: '', doctrineIds: [] });
    const p = formProblems(form);
    expect(p.killmailPct).toBe(true);
    expect(p.appraisalPct).toBe(true);
    expect(p.windowDays).toBe(true);
    expect(p.fixedIsk).toEqual([ruleKey('hull', 9)]);
    expect(p.percentRuleWithoutPercent).toBe(false);
    expect(p.count).toBe(4);
    const none = { ...formFromSettings(saved), killmailPct: '', appraisalPct: '' };
    expect(formProblems(none).percentRuleWithoutPercent).toBe(true);
    expect(formProblems(none).count).toBe(1);
  });

  it('accepts blank percents and in-range values', () => {
    const form = { ...formFromSettings(saved), killmailPct: '', appraisalPct: '100' };
    expect(formProblems(form).killmailPct).toBe(false);
    expect(formProblems(form).appraisalPct).toBe(false);
  });

  describe('Doctrine Fits on a hull rule', () => {
    const withDoctrines: SrpSettings = {
      ...saved,
      hullRules: [
        ...saved.hullRules,
        { scope: 'hull', id: 17715, kind: 'officer-decides', doctrineIds: ['b', 'a'] },
      ],
    };

    it('carries the ids through the form unchanged', () => {
      const form = formFromSettings(withDoctrines);
      expect(ruleOf(form, 'hull', 17715).doctrineIds).toEqual(['b', 'a']);
      expect(formIsDirty(form, withDoctrines)).toBe(false);
      expect(formToPatch(form, withDoctrines)).toEqual({});
    });

    it('a patch of something else leaves the rule list alone, attachments kept', () => {
      const form = { ...formFromSettings(withDoctrines), windowDays: '45' };
      expect(formToPatch(form, withDoctrines)).toEqual({ windowDays: 45 });
    });

    it('attaching or detaching reads as an edit and sends sorted ids', () => {
      const form = setDoctrineIds(formFromSettings(saved), 641, ['z', 'c']);
      expect(formIsDirty(form, saved)).toBe(true);
      const rule = formToPatch(form, saved).hullRules?.find((r) => r.id === 641);
      expect(rule).toEqual({
        scope: 'hull',
        id: 641,
        kind: 'not-covered',
        doctrineIds: ['c', 'z'],
      });
      const cleared = setDoctrineIds(formFromSettings(withDoctrines), 17715, []);
      const sent = formToPatch(cleared, withDoctrines).hullRules?.find((r) => r.id === 17715);
      expect(sent).toEqual({ scope: 'hull', id: 17715, kind: 'officer-decides' });
    });

    it('attaching to a hull with no rule gives it Pay: corp percent', () => {
      const form = setDoctrineIds(formFromSettings(saved), 999, ['a']);
      expect(ruleOf(form, 'hull', 999)).toEqual({
        kind: 'pay-percent',
        isk: '',
        doctrineIds: ['a'],
      });
    });

    it('detaching the last doctrine from a no-rule hull leaves no rule behind', () => {
      const form = setDoctrineIds(formFromSettings(saved), 999, []);
      expect(ruleOf(form, 'hull', 999).kind).toBe('none');
    });

    it('a deleted doctrine never reads as an edit, nor goes out with the next save', () => {
      const form = formFromSettings(withDoctrines);
      const live = new Set(['a']);
      expect(formIsDirty(form, withDoctrines, live)).toBe(false);
      const edited = setDoctrineIds(form, 641, ['a']);
      const rule = formToPatch(edited, withDoctrines, live).hullRules?.find((r) => r.id === 17715);
      expect(rule).toEqual({
        scope: 'hull',
        id: 17715,
        kind: 'officer-decides',
        doctrineIds: ['a'],
      });
    });
  });
});
