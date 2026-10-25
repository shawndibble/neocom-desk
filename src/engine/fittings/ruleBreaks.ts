import type { RuleBreak } from './types';

/** What a break is about, apart from how far over it is. */
function identity(b: RuleBreak): string {
  switch (b.kind) {
    case 'max_group':
      return `${b.kind}:${b.groupId}:${b.limit}`;
    case 'max_type':
      return `${b.kind}:${b.typeId}`;
    case 'slots':
      return `${b.kind}:${b.slot}`;
    default:
      return `${b.kind}:${b.typeId ?? ''}`;
  }
}

/** How far over its limit a counted break is; 0 for one with no count. */
function overBy(b: RuleBreak): number {
  switch (b.kind) {
    case 'max_group':
    case 'max_type':
      return b.used - b.allowed;
    case 'slots':
      return b.used - b.available;
    default:
      return 0;
  }
}

/**
 * The rule breaks `after` has that `before` did not: a break of a kind the
 * before-fit lacked, a further copy of an item-level one, or a counted one it
 * passes by more. A fit that already breaks a rule can still change, as long
 * as it adds no break.
 */
export function newRuleBreaks(
  before: readonly RuleBreak[],
  after: readonly RuleBreak[]
): RuleBreak[] {
  const was = new Map<string, { over: number; copies: number }>();
  for (const b of before) {
    const prior = was.get(identity(b));
    was.set(identity(b), { over: overBy(b), copies: (prior?.copies ?? 0) + 1 });
  }
  const seen = new Map<string, number>();
  return after.filter((b) => {
    const key = identity(b);
    const copy = (seen.get(key) ?? 0) + 1;
    seen.set(key, copy);
    const prior = was.get(key);
    return prior === undefined || overBy(b) > prior.over || copy > prior.copies;
  });
}
