/**
 * One row per skill level (see reorder.ts): expand an entry that trains
 * several levels ("Mass Production V" on a level-III character trains IV and
 * V) into one entry per level, so each level is its own draggable row and the
 * user can put other skills between them.
 *
 * Pure, and idempotent — a plan already split re-splits to itself, which is
 * what lets the editor run this on every plan it loads and write only when
 * something actually changed.
 */
import { normalizePlanWithBoundaries } from '@/engine/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { entrySlices } from './entrySlices';

export interface SplitPlan {
  entries: PlanEntry[];
  /** `markers` translated to the new positions; undefined when the input had none. */
  markers: number[] | undefined;
  /** False when nothing moved, so the caller can skip a pointless write. */
  changed: boolean;
}

/**
 * The levels each entry trains of its own skill, in entry order — exactly the
 * "own steps" slice `summarizeEntryQueue` renders per row, so a split row and
 * the row it came from show the same levels.
 *
 * An entry contributing no level of its own (already trained, or covered by
 * an earlier entry of the same skill) yields an empty list; the caller keeps
 * such an entry as a single unchanged row rather than dropping the user's
 * row on the floor.
 */
function ownLevelsPerEntry(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): number[][] | null {
  const isKnown = (skillTypeID: number) => skills.has(skillTypeID);
  let plan;
  try {
    plan = normalizePlanWithBoundaries(
      entries.filter((e) => isKnown(e.skillTypeID)),
      skills,
      trainedSkills
    );
  } catch {
    // A circular or unknown-skill plan is already broken and already
    // reported by the editor. Splitting is a convenience, not a repair.
    return null;
  }

  return entrySlices(entries, plan.entryBoundaries, plan.steps, isKnown).map(
    ({ ownStart, end }) => {
      if (ownStart === -1) return [];
      const levels: number[] = [];
      for (let i = ownStart; i < end; i++) {
        if (plan.steps[i].skillTypeID === plan.steps[ownStart].skillTypeID) {
          levels.push(plan.steps[i].level);
        }
      }
      return levels;
    }
  );
}

/**
 * Split every entry into one entry per level it trains, moving each marker to
 * the position that keeps it in front of the same entry.
 *
 * Markers are entry-list *positions* ("remap before entries[p]"), so growing
 * the list ahead of a marker slides that marker onto a different entry unless
 * it is translated too — silent corruption of a plan the user never edited.
 * `markerAttributes` needs no such fixup: splitting changes no marker's
 * ordinal or order, and two markers can never collapse onto one position
 * because every entry yields at least one row.
 */
export function splitEntriesByLevel(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined,
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): SplitPlan {
  const unchanged: SplitPlan = {
    entries: [...entries],
    markers: markers ? [...markers] : undefined,
    changed: false,
  };

  const ownLevels = ownLevelsPerEntry(entries, skills, trainedSkills);
  if (ownLevels === null) return unchanged;

  const split: PlanEntry[] = [];
  // rowsBefore[p] = how many rows the entries before position p now occupy —
  // the new position of a marker that sat at old position p.
  const rowsBefore: number[] = [0];
  entries.forEach((entry, i) => {
    const levels = ownLevels[i];
    if (levels.length === 0) split.push(entry);
    else for (const level of levels) split.push({ ...entry, targetLevel: level });
    rowsBefore.push(split.length);
  });

  if (split.length === entries.length) return unchanged;
  return {
    entries: split,
    // `Math.round` before indexing: `rowsBefore` is a dense array, so a
    // fractional or NaN position (corrupt or externally-written data — the
    // editor only ever writes integers) would read `undefined` and persist a
    // hole in a `number[]`. `normalizeMarkers` clamps such values on every
    // read and so tolerated them; writing one back does not, and Firestore
    // rejects `undefined` inside an array outright.
    markers: markers?.map((m) => {
      const position = Number.isFinite(m) ? Math.round(m) : 0;
      return rowsBefore[Math.min(entries.length, Math.max(0, position))];
    }),
    changed: true,
  };
}
