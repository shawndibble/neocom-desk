/**
 * The Certificates tab's rows (issue #2390): each combat Certificate graded
 * against the active Character, with what its next grade still needs. Pure —
 * the page hook supplies trained levels, the target plan's entries and (for
 * an Alpha Character only) the Alpha caps; training time is costed there too,
 * by the same scheduler the Skill Plan uses.
 */
import { alphaCappedEntries, tiersReached } from '@/engine/tierLadder';
import type { PlanEntry } from '@/engine/types';
import {
  masteryTierEntries,
  unplannedTierEntries,
} from '@/features/fittings/shipTree/shipTreeModel';
import type { Certificate } from '@/sde/types';

/** 0 = not started, 1 Basic … 5 Elite. */
export type CertificateGrade = 0 | 1 | 2 | 3 | 4 | 5;
export const ELITE = 5;

export interface CertificateRow {
  certificate: Certificate;
  grade: CertificateGrade;
  /** Untrained levels the next grade needs; empty at Elite. */
  next: PlanEntry[];
  /** `next` minus what the target plan already covers — what "Add" adds. */
  unplanned: PlanEntry[];
  /** Levels of `next` an Alpha clone can't train; always empty for Omega. */
  alphaCapped: PlanEntry[];
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
    const grade = tiersReached(certificate.levels, trainedLevel) as CertificateGrade;
    if (grade === ELITE) {
      return { certificate, grade, next: [], unplanned: [], alphaCapped: [] };
    }
    const next = masteryTierEntries(certificate.levels, grade + 1, trainedLevel);
    return {
      certificate,
      grade,
      next,
      unplanned: unplannedTierEntries(certificate.levels, grade + 1, trainedLevel, planEntries),
      alphaCapped: alphaMaxLevel ? alphaCappedEntries(next, alphaMaxLevel) : [],
    };
  });
}

export interface GradeSummary {
  elite: number;
  advanced: number;
  /** Basic, and not yet Standard. */
  basicOnly: number;
  notStarted: number;
}

export function gradeSummary(rows: readonly CertificateRow[]): GradeSummary {
  const count = (grade: CertificateGrade) => rows.filter((r) => r.grade === grade).length;
  return { elite: count(5), advanced: count(4), basicOnly: count(1), notStarted: count(0) };
}

export interface CertificateFilter {
  /** A certificate group name, or null for every group. */
  group: string | null;
  hideElite: boolean;
}

export function filterRows(
  rows: readonly CertificateRow[],
  { group, hideElite }: CertificateFilter
): CertificateRow[] {
  return rows.filter(
    (r) =>
      (group === null || r.certificate.groupName === group) && !(hideElite && r.grade === ELITE)
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
  secondsToNext: ReadonlyMap<number, number>
): CertificateRow[] {
  const sorted = [...rows];
  if (sort === 'name') return sorted.sort(byName);
  if (sort === 'grade') return sorted.sort((a, b) => a.grade - b.grade || byName(a, b));
  const seconds = (r: CertificateRow) =>
    r.grade === ELITE ? Infinity : (secondsToNext.get(r.certificate.id) ?? 0);
  return sorted.sort((a, b) => seconds(a) - seconds(b) || byName(a, b));
}
