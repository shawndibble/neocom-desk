/**
 * How common each **module group** is among the community's fits for a hull
 * (issue #5581, parent #5548): the EVE Workbench fits give Improve the overall
 * idea of how a hull is flown, not a verdict. Players who wrote those fits
 * often do not know every variation, so only the GROUP is counted (never a
 * type or a variant: the engine's scores choose that), plus the propulsion
 * kind (afterburner, MWD, micro jump drive), which is a role choice.
 *
 * Commonality never scores. It only adds candidate groups to a search and
 * breaks gains that are within 1% of each other; nothing the engine tries
 * without it is removed or filtered by it. Pure: the caller loads the fits,
 * checks them against today's game data, and injects `groupOf`.
 */
import { IMPROVE_JOBS as JOBS, type ImproveJob } from './improveJob';

/** A fit that needs ten matching fits to say anything about the hull. */
export const MIN_JOB_FITS = 10;
/** A group on at least this share of the job's fits joins the search's Rework groups. */
export const COMMON_GROUP_SHARE = 0.25;
/** A target group on at least this share earns the quiet "on N% of fits" hint. */
export const HINT_SHARE = 0.5;
/** A Makeover that removes a group at least this many fits keep earns a quiet caution. */
export const CAUTION_SHARE = 0.8;
/** Gains this close (relative) are a tie, and the more common target group wins. */
export const TIE_WITHIN = 0.01;
/** A fit named for no job counts for every job, at half weight. */
export const UNNAMED_WEIGHT = 0.5;

export type PropulsionKind = 'afterburner' | 'mwd' | 'mjd';
export const PROPULSION_KINDS: readonly PropulsionKind[] = ['afterburner', 'mwd', 'mjd'];

/** SDE group of afterburners and microwarpdrives. */
export const PROPULSION_GROUP = 46;
/** SDE group of micro jump drives. */
export const MICRO_JUMP_DRIVE_GROUP = 1189;

/**
 * The propulsion kind of a module from its group and name; null for any other
 * module. The names are the game's: "10MN Afterburner II", "50MN Y-T8
 * Compact Microwarpdrive", "Medium Micro Jump Drive".
 */
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

// Stems match a word's start ("mission", "missions"); the short ones match whole words.
const JOB_NAME_PATTERNS: Record<ImproveJob, RegExp> = {
  pve: /\b(pve|l[1-5]s?|rats?)\b|\b(mission|anom|abyss|burner|incursion|haven|sanctum|site)/i,
  pvp: /\b(pvp|solo|gang|fleet|roam|kite|brawl|nano)/i,
  explore: /\bwh\b|\b(explor|hack|relic|data|scan|wormhole)/i,
};

/** The jobs a fit name says it is for; none: it counts for every job at half weight. */
export function jobsOfFitName(name: string): ImproveJob[] {
  return JOBS.filter((job) => JOB_NAME_PATTERNS[job].test(name));
}

/** One current fit of the hull: its name and the type ids of its fitted modules. */
export interface CommonalityFit {
  name: string;
  moduleTypeIds: readonly number[];
}

/** What the hull's fits say for one Improve Job. */
export interface JobCommonality {
  /** Weighted fits behind the shares (an unnamed fit counts half). */
  fits: number;
  /** Group id to the share (0..1) of the job's fits carrying at least one module of that group. */
  groupShare: ReadonlyMap<number, number>;
  /** Share of the job's fits carrying each propulsion kind. */
  propulsion: Readonly<Record<PropulsionKind, number>>;
}

export type HullCommonality = Readonly<Record<ImproveJob, JobCommonality | null>>;

/**
 * The shares per Improve Job from `fits` (current Workbench fits only: the
 * caller drops out-of-date ones). A job with fewer than `MIN_JOB_FITS`
 * (weighted) fits is null: too little data.
 */
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

/** The share of the job's fits carrying `group`; 0 without data. */
export function groupShareOf(
  commonality: JobCommonality | null | undefined,
  group: number | undefined
): number {
  return commonality && group !== undefined ? (commonality.groupShare.get(group) ?? 0) : 0;
}

/** The share of the job's fits carrying a move's target GROUP (never its variant), for the near-tie order. */
export function targetShareOf(
  commonality: JobCommonality | null | undefined,
  groupOf: (typeId: number) => number | undefined
): ((move: { toTypeId: number }) => number) | undefined {
  return commonality ? (move) => groupShareOf(commonality, groupOf(move.toTypeId)) : undefined;
}

/**
 * The module groups a Makeover takes off the fit entirely (every module of the group
 * replaced by another group's, none added) that at least `CAUTION_SHARE` of the job's
 * fits keep. `before` are the open fit's fitted modules; `rows` the Makeover's changes.
 */
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

/** The groups on at least `COMMON_GROUP_SHARE` of the job's fits, most common first. */
export function commonGroups(commonality: JobCommonality | null | undefined): number[] {
  if (!commonality) return [];
  return [...commonality.groupShare]
    .filter(([, share]) => share >= COMMON_GROUP_SHARE)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([group]) => group);
}

/**
 * The propulsion kind most of the job's fits carry; null without data or when
 * none does. A tie goes to the earlier of afterburner, MWD, micro jump drive.
 * For the propulsion choice (#5578).
 */
export function commonPropulsionKind(
  commonality: JobCommonality | null | undefined
): PropulsionKind | null {
  if (!commonality) return null;
  let best: PropulsionKind | null = null;
  for (const kind of PROPULSION_KINDS)
    if (commonality.propulsion[kind] > (best ? commonality.propulsion[best] : 0)) best = kind;
  return best;
}

/** Whether two gains are within `TIE_WITHIN` of each other. */
export function withinTie(a: number, b: number): boolean {
  return Math.abs(a - b) <= TIE_WITHIN * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * `items` best score first, with each run of scores within 1% of the run's
 * best put in order of `share` (most common target group first). Scores in a
 * run keep their order among equal shares. `sameClass` keeps rows that are
 * ranked apart for another reason (a fix, an unpriced swap) from mixing.
 * Without `share` the order is returned unchanged.
 */
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
