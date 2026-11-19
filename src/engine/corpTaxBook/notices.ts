/**
 * A running account's late notices (#6294, decision 20261117-033049): when a Miner who is behind
 * gets one, the least they must owe, and how long before another. Stored on the book as
 * `noticeRules`; the server mirror is `functions/src/corpTaxBookKinds.ts`.
 */
import { isFiniteNumber, isRecord } from '../guards';

/** `behind`: the oldest unpaid day is `days` old. `dayOfMonth`: on that day of each month. */
export type NoticeAfter = { kind: 'behind'; days: number } | { kind: 'dayOfMonth'; day: number };

export interface NoticeRules {
  after: NoticeAfter;
  /** The least owed, in ISK, for a notice. */
  minimum: number;
  /** Days after a notice before another may go. */
  cooldownDays: number;
  /** A Miner (every Character of the group together) owing this much is due a notice before `after`. Absent: off. */
  earlyAt?: number;
}

export const NOTICE_AFTER_KINDS = ['behind', 'dayOfMonth'] as const;

export const DEFAULT_NOTICE_RULES: NoticeRules = {
  after: { kind: 'behind', days: 14 },
  minimum: 10_000_000,
  cooldownDays: 7,
};

/** Bounds the server holds them to (`parseSettingsPatch`). */
const isWhole = (x: unknown, min: number, max: number): x is number =>
  isFiniteNumber(x) && Number.isInteger(x) && x >= min && x <= max;

/** A stored `noticeRules`, every missing, malformed or out-of-bounds part at its default. */
export function parseNoticeRules(raw: unknown): NoticeRules {
  const d = isRecord(raw) ? raw : {};
  const a = isRecord(d.after) ? d.after : {};
  const after: NoticeAfter =
    a.kind === 'dayOfMonth' && isWhole(a.day, 1, 28)
      ? { kind: 'dayOfMonth', day: a.day }
      : a.kind === 'behind' && isWhole(a.days, 1, 365)
        ? { kind: 'behind', days: a.days }
        : DEFAULT_NOTICE_RULES.after;
  return {
    after,
    minimum: isFiniteNumber(d.minimum) && d.minimum >= 0 ? d.minimum : DEFAULT_NOTICE_RULES.minimum,
    cooldownDays: isWhole(d.cooldownDays, 1, 90)
      ? d.cooldownDays
      : DEFAULT_NOTICE_RULES.cooldownDays,
    ...(isFiniteNumber(d.earlyAt) && d.earlyAt > 0 ? { earlyAt: d.earlyAt } : {}),
  };
}
