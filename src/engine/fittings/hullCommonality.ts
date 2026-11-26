import { IMPROVE_JOBS as JOBS, type ImproveJob } from './improve';

export const MIN_JOB_FITS = 10;
export const COMMON_GROUP_SHARE = 0.25;
export const HINT_SHARE = 0.5;
export const CAUTION_SHARE = 0.8;
export const TIE_WITHIN = 0.01;
export const UNNAMED_WEIGHT = 0.5;

export type PropulsionKind = 'afterburner' | 'mwd' | 'mjd';
export const PROPULSION_KINDS: readonly PropulsionKind[] = ['afterburner', 'mwd', 'mjd'];

export const PROPULSION_GROUP = 46;
export const MICRO_JUMP_DRIVE_GROUP = 1189;

export function propulsionKindOf(
  groupId: number | undefined,
  name: string | undefined
): PropulsionKind | null {
  if (groupId === MICRO_JUMP_DRIVE_GROUP) return 'mjd';
  if (groupId !== PROPULSION_GROUP || name === undefined) return null;
  if (/afterburner/i.test(name)) return 'afterburner';
  if (/microwarpdrive/i.test(name)) return 'mwd';
  return null;
}

const JOB_NAME_PATTERNS: Record<ImproveJob, RegExp> = {
  pve: /\b(pve|l[1-5]s?|rats?)\b|\b(mission|anom|abyss|burner|incursion|haven|sanctum|site)/i,
  pvp: /\b(pvp|solo|gang|fleet|roam|kite|brawl|nano)/i,
  explore: /\bwh\b|\b(explor|hack|relic|data|scan|wormhole)/i,
};

export function jobsOfFitName(name: string): ImproveJob[] {
  return JOBS.filter((job) => JOB_NAME_PATTERNS[job].test(name));
}

export interface CommonalityFit {
  name: string;
  moduleTypeIds: readonly number[];
}

export interface JobCommonality {
  fits: number;
  groupShare: ReadonlyMap<number, number>;
  propulsion: Readonly<Record<PropulsionKind, number>>;
}

export type HullCommonality = Readonly<Record<ImproveJob, JobCommonality | null>>;

export function hullCommonality(
  fits: readonly CommonalityFit[],
  groupOf: (typeId: number) => number | undefined,
  propulsionOf: (typeId: number) => PropulsionKind | null
): HullCommonality {
  const result = {} as Record<ImproveJob, JobCommonality | null>;
  const facts = fits.map((fit) => {
    const groups = new Set<number>();
    const kinds = new Set<PropulsionKind>();
    for (const typeId of fit.moduleTypeIds) {
      const group = groupOf(typeId);
      if (group !== undefined) groups.add(group);
      const kind = propulsionOf(typeId);
      if (kind) kinds.add(kind);
    }
    return { jobs: jobsOfFitName(fit.name), groups, kinds };
  });
  for (const job of JOBS) {
    let weight = 0;
    const groupWeight = new Map<number, number>();
    const kindWeight: Record<PropulsionKind, number> = { afterburner: 0, mwd: 0, mjd: 0 };
    for (const fact of facts) {
      const w = fact.jobs.length === 0 ? UNNAMED_WEIGHT : fact.jobs.includes(job) ? 1 : 0;
      if (w === 0) continue;
      weight += w;
      for (const group of fact.groups) groupWeight.set(group, (groupWeight.get(group) ?? 0) + w);
      for (const kind of fact.kinds) kindWeight[kind] += w;
    }
    if (weight < MIN_JOB_FITS) {
      result[job] = null;
      continue;
    }
    result[job] = {
      fits: weight,
      groupShare: new Map([...groupWeight].map(([group, w]) => [group, w / weight])),
      propulsion: {
        afterburner: kindWeight.afterburner / weight,
        mwd: kindWeight.mwd / weight,
        mjd: kindWeight.mjd / weight,
      },
    };
  }
  return result;
}

export function groupShareOf(
  commonality: JobCommonality | null | undefined,
  group: number | undefined
): number {
  return commonality && group !== undefined ? (commonality.groupShare.get(group) ?? 0) : 0;
}

export function targetShareOf(
  commonality: JobCommonality | null | undefined,
  groupOf: (typeId: number) => number | undefined
): ((move: { toTypeId: number }) => number) | undefined {
  return commonality ? (move) => groupShareOf(commonality, groupOf(move.toTypeId)) : undefined;
}

export function removedCommonGroups(
  before: readonly { typeId: number }[],
  rows: readonly { fromTypeId: number | null; toTypeId: number; at: readonly unknown[] }[],
  groupOf: (typeId: number) => number | undefined,
  commonality: JobCommonality | null | undefined
): number[] {
  if (!commonality) return [];
  const held = new Map<number, number>();
  for (const { typeId } of before) {
    const group = groupOf(typeId);
    if (group !== undefined) held.set(group, (held.get(group) ?? 0) + 1);
  }
  const left = new Map(held);
  for (const row of rows) {
    const from = row.fromTypeId === null ? undefined : groupOf(row.fromTypeId);
    const to = groupOf(row.toTypeId);
    if (from !== undefined) left.set(from, (left.get(from) ?? 0) - row.at.length);
    if (to !== undefined) left.set(to, (left.get(to) ?? 0) + row.at.length);
  }
  return [...held.keys()].filter(
    (group) => (left.get(group) ?? 0) <= 0 && groupShareOf(commonality, group) >= CAUTION_SHARE
  );
}

export function commonGroups(commonality: JobCommonality | null | undefined): number[] {
  if (!commonality) return [];
  return [...commonality.groupShare]
    .filter(([, share]) => share >= COMMON_GROUP_SHARE)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([group]) => group);
}

export function commonPropulsionKind(
  commonality: JobCommonality | null | undefined
): PropulsionKind | null {
  if (!commonality) return null;
  let best: PropulsionKind | null = null;
  for (const kind of PROPULSION_KINDS)
    if (commonality.propulsion[kind] > (best ? commonality.propulsion[best] : 0)) best = kind;
  return best;
}

export function withinTie(a: number, b: number): boolean {
  return Math.abs(a - b) <= TIE_WITHIN * Math.max(Math.abs(a), Math.abs(b));
}

export function breakTies<T>(
  items: readonly T[],
  score: (item: T) => number,
  share: ((item: T) => number) | undefined,
  sameClass: (a: T, b: T) => boolean = () => true
): T[] {
  if (!share) return [...items];
  const out: T[] = [];
  for (let i = 0; i < items.length;) {
    let end = i + 1;
    while (
      end < items.length &&
      sameClass(items[i], items[end]) &&
      withinTie(score(items[i]), score(items[end]))
    )
      end++;
    out.push(...items.slice(i, end).sort((a, b) => share(b) - share(a)));
    i = end;
  }
  return out;
}
