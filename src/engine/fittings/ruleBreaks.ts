import type { RuleBreak } from './types';

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
