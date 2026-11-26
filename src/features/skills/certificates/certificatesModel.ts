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

export type CertificateGrade = 0 | 1 | 2 | 3 | 4 | 5;
export const ELITE: CertificateGrade = 5;

export interface CertificateRow {
  certificate: Certificate;
  grade: CertificateGrade;
  next: PlanEntry[];
  unplanned: PlanEntry[];
  alphaCapped: PlanEntry[];
  alphaReach: CertificateGrade | null;
}

export interface CertificateRowInputs {
  trainedLevel: (skillTypeID: number) => number;
  planEntries: readonly PlanEntry[];
  alphaMaxLevel?: (skillTypeID: number) => number;
}

export function certificateRows(
  certificates: readonly Certificate[],
  { trainedLevel, planEntries, alphaMaxLevel }: CertificateRowInputs
): CertificateRow[] {
  return certificates.map((certificate) => {
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

export const GRADES: readonly CertificateGrade[] = [0, 1, 2, 3, 4, 5];
export const ALL_GRADES: ReadonlySet<CertificateGrade> = new Set(GRADES);

export function gradeCounts(rows: readonly CertificateRow[]): number[] {
  const counts = GRADES.map(() => 0);
  for (const r of rows) counts[r.grade]++;
  return counts;
}

export interface CertificateFilter {
  group: string | null;
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

export interface CertificateStep {
  skillTypeID: number;
  level: number;
  seconds: number;
}

export interface CertificateTime {
  total: number;
  steps: CertificateStep[];
}

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
