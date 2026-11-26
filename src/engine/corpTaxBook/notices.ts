import { isFiniteNumber, isRecord } from '../guards';
import {
  NOTICE_AFTER_KINDS,
  NOTICE_DEFAULTS,
  NOTICE_RULE_BOUNDS,
  type NoticeRules,
} from '../../../functions/src/corpTaxBookKinds';

export { NOTICE_AFTER_KINDS, type NoticeRules };

export type NoticeAfter = NoticeRules['after'];

export const DEFAULT_NOTICE_RULES: NoticeRules = {
  after: { ...NOTICE_DEFAULTS.after },
  minimum: NOTICE_DEFAULTS.minimum,
  cooldownDays: NOTICE_DEFAULTS.cooldownDays,
};

const isWhole = (x: unknown, bound: { min: number; max: number }): x is number =>
  isFiniteNumber(x) && Number.isInteger(x) && x >= bound.min && x <= bound.max;
const B = NOTICE_RULE_BOUNDS;

export function parseNoticeRules(raw: unknown): NoticeRules {
  const d = isRecord(raw) ? raw : {};
  const a = isRecord(d.after) ? d.after : {};
  const after: NoticeAfter =
    a.kind === 'dayOfMonth' && isWhole(a.day, B.dayOfMonth)
      ? { kind: 'dayOfMonth', day: a.day }
      : a.kind === 'behind' && isWhole(a.days, B.behindDays)
        ? { kind: 'behind', days: a.days }
        : DEFAULT_NOTICE_RULES.after;
  return {
    after,
    minimum: isFiniteNumber(d.minimum) && d.minimum >= 0 ? d.minimum : DEFAULT_NOTICE_RULES.minimum,
    cooldownDays: isWhole(d.cooldownDays, B.cooldownDays)
      ? d.cooldownDays
      : DEFAULT_NOTICE_RULES.cooldownDays,
    ...(isFiniteNumber(d.earlyAt) && d.earlyAt > 0 ? { earlyAt: d.earlyAt } : {}),
  };
}
