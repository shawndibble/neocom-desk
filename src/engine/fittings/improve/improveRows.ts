import type { ImproveCandidate, ImproveOption } from './improve';
import { nullsLast } from '@/engine/math';

export const IMPROVE_SORTS = ['gain', 'value', 'cheapest'] as const;
export type ImproveSort = (typeof IMPROVE_SORTS)[number];

export interface ModuleGroup {
  key: string;
  best: ImproveOption;
  others: ImproveOption[];
}

const MILLION = 1_000_000;

export const moduleKey = (candidate: ImproveCandidate): string =>
  candidate.conversion
    ? `conversion|${candidate.conversion.side}`
    : `${candidate.fromTypeId ?? 'empty'}|${candidate.at
        .map((at) => `${at.slot}:${at.slotIndex}`)
        .sort()
        .join(',')}`;

function valueOf(option: ImproveOption): number | null {
  if (option.iskDelta === null) return null;
  if (option.iskDelta > 0) return option.score / (option.iskDelta / MILLION);
  return option.score > 0 ? Infinity : option.score;
}

const byGain = (a: ImproveOption, b: ImproveOption) => b.score - a.score;

const COMPARE: Record<ImproveSort, (a: ImproveOption, b: ImproveOption) => number> = {
  gain: (a, b) => byGain(a, b) || nullsLast(a.iskDelta, b.iskDelta, 1),
  value: (a, b) => nullsLast(valueOf(a), valueOf(b), -1) || byGain(a, b),
  cheapest: (a, b) => nullsLast(a.iskDelta, b.iskDelta, 1) || byGain(a, b),
};

const fixFirst = (a: ImproveOption, b: ImproveOption) =>
  Number(b.candidate.fixesUnflyable === true) - Number(a.candidate.fixesUnflyable === true);

export function groupByModule(options: readonly ImproveOption[], sort: ImproveSort): ModuleGroup[] {
  const compare = (a: ImproveOption, b: ImproveOption) => fixFirst(a, b) || COMPARE[sort](a, b);
  const byModule = new Map<string, ImproveOption[]>();
  for (const option of options) {
    const key = moduleKey(option.candidate);
    byModule.set(key, [...(byModule.get(key) ?? []), option]);
  }
  return [...byModule]
    .map(([key, members]) => {
      const [best, ...others] = [...members].sort(compare);
      return { key, best: best!, others };
    })
    .sort((a, b) => compare(a.best, b.best));
}
