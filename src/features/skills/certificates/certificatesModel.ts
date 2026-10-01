/**
 * The Certificates tab's rows (issue #2390): each combat Certificate graded
 * against the active Character, with what its next grade still needs. Pure —
 * the page supplies trained levels, the target plan's entries and (for an
 * Alpha Character only) the Alpha caps. Training time comes from the same
 * scheduler the Skill Plan and the Mastery tab use.
 */
import { alphaCappedEntries, tiersReached } from '@/engine/tierLadder';
import type { PlanEntry } from '@/engine/types';
import {
  masteryTierEntries,
  unplannedTierEntries,
} from '@/features/fittings/shipTree/shipTreeModel';
import {
  scheduleEntries,
  type ScheduleEntriesContext,
} from '@/features/skills/ships/scheduleEntries';
import type { Certificate } from '@/sde/types';

/** 0 = not started, 1 Basic … 5 Elite. */
export type CertificateGrade = 0 | 1 | 2 | 3 | 4 | 5;
export const ELITE: CertificateGrade = 5;

export interface CertificateRow {
  certificate: Certificate;
  grade: CertificateGrade;
  /** Untrained levels the next grade needs; empty at Elite. */
  next: PlanEntry[];
  /** `next` minus what the target plan already covers — what "Add" adds. */
  unplanned: PlanEntry[];
  /** Levels of `next` an Alpha clone can't train; always empty for Omega. */
  alphaCapped: PlanEntry[];
  /** Highest grade an Alpha clone reaches — set only when the cap stops the next grade. */
  alphaReach: CertificateGrade | null;
}

export interface CertificateRowInputs {
  trainedLevel: (skillTypeID: number) => number;
  planEntries: readonly PlanEntry[];
  /** Only for an Alpha Character: an Omega is never shown a cap. */
  alphaMaxLevel?: (skillTypeID: number) => number;
}

export function certificateRows(
  certificates: readonly Certificate[],
  { trainedLevel, planEntries, alphaMaxLevel }: CertificateRowInputs
): CertificateRow[] {
  return certificates.map((certificate) => {
    // Clamped: the bake guarantees five grades, but the type shouldn't rely on it.
    const grade = Math.min(
      tiersReached(certificate.levels, trainedLevel),
      ELITE
    ) as CertificateGrade;
    if (grade === ELITE) {
      return { certificate, grade, next: [], unplanned: [], alphaCapped: [], alphaReach: null };
    }
    const next = masteryTierEntries(certificate.levels, grade + 1, trainedLevel);
    const alphaCapped = alphaMaxLevel ? alphaCappedEntries(next, alphaMaxLevel) : [];
    return {
      certificate,
      grade,
      next,
      unplanned: unplannedTierEntries(certificate.levels, grade + 1, trainedLevel, planEntries),
      alphaCapped,
      alphaReach:
        alphaMaxLevel && alphaCapped.length > 0
          ? (Math.min(tiersReached(certificate.levels, alphaMaxLevel), ELITE) as CertificateGrade)
          : null,
    };
  });
}

/** Every grade, Not started through Elite — the grade filter's default. */
export const GRADES: readonly CertificateGrade[] = [0, 1, 2, 3, 4, 5];
export const ALL_GRADES: ReadonlySet<CertificateGrade> = new Set(GRADES);

/** How many certificates sit at each grade, indexed by grade (0–5). */
export function gradeCounts(rows: readonly CertificateRow[]): number[] {
  const counts = GRADES.map(() => 0);
  for (const r of rows) counts[r.grade]++;
  return counts;
}

export interface CertificateFilter {
  /** A certificate group name, or null for every group. */
  group: string | null;
  /** The grades to show; an empty set shows nothing. */
  grades: ReadonlySet<CertificateGrade>;
}

export function filterRows(
  rows: readonly CertificateRow[],
  { group, grades }: CertificateFilter
): CertificateRow[] {
  return rows.filter(
    (r) => (group === null || r.certificate.groupName === group) && grades.has(r.grade)
  );
}

export type CertificateSort = 'grade' | 'name' | 'time';

const byName = (a: CertificateRow, b: CertificateRow) =>
  a.certificate.name.localeCompare(b.certificate.name);

/**
 * `grade`: lowest grade first — the weakest areas lead. `time`: least
 * training to the next grade first, Elite (nothing left) last. Name breaks
 * every tie.
 */
export function sortRows(
  rows: readonly CertificateRow[],
  sort: CertificateSort,
  times: ReadonlyMap<number, CertificateTime>
): CertificateRow[] {
  const sorted = [...rows];
  if (sort === 'name') return sorted.sort(byName);
  if (sort === 'grade') return sorted.sort((a, b) => a.grade - b.grade || byName(a, b));
  const seconds = (r: CertificateRow) =>
    r.grade === ELITE ? Infinity : (times.get(r.certificate.id)?.total ?? 0);
  return sorted.sort((a, b) => seconds(a) - seconds(b) || byName(a, b));
}

/** One skill's share of a certificate's next grade: its highest level and summed time. */
export interface CertificateStep {
  skillTypeID: number;
  level: number;
  seconds: number;
}

export interface CertificateTime {
  total: number;
  /**
   * Every skill the schedule trains, in schedule order — prerequisites the
   * scheduler injects included, so the steps always sum to `total`.
   */
  steps: CertificateStep[];
}

/**
 * Each non-Elite row's time to its next grade, keyed by certificate id. All
 * rows are costed, not just an expanded one: the "least time" sort needs them.
 */
export function certificateTimes(
  rows: readonly CertificateRow[],
  ctx: ScheduleEntriesContext
): Map<number, CertificateTime> {
  const times = new Map<number, CertificateTime>();
  for (const row of rows) {
    if (row.next.length === 0) continue;
    const bySkill = new Map<number, CertificateStep>();
    let total = 0;
    for (const step of scheduleEntries(row.next, ctx)) {
      const seen = bySkill.get(step.skillTypeID);
      if (seen) {
        seen.level = Math.max(seen.level, step.level);
        seen.seconds += step.seconds;
      } else {
        bySkill.set(step.skillTypeID, {
          skillTypeID: step.skillTypeID,
          level: step.level,
          seconds: step.seconds,
        });
      }
      total += step.seconds;
    }
    times.set(row.certificate.id, { total, steps: [...bySkill.values()] });
  }
  return times;
}
