/**
 * Pure Skill Plan editing helpers, unit-testable without simulating real
 * drag events. Drag-and-drop reordering itself lives in markers.ts
 * (reorderRows), which handles entries and Remap Markers together.
 *
 * One entry per skill LEVEL: "Mass Production IV" and "Mass Production V" are
 * two rows, so the user can put other skills between them. PlanEntry has no
 * id of its own, so `skillTypeID` and `targetLevel` together double as the
 * @dnd-kit sortable id (`entryId`). That only holds if no two entries share
 * both; `upsertEntry`, `dedupeEntries` and `splitEntriesByLevel` are the
 * three places entries are ever introduced, so every caller must route
 * through them.
 */
import type { PlanEntry, PlanPriority, PlanStep } from '@/engine/types';

/** Sortable id for an entry (dnd-kit needs a stable string per row). */
export function entryId(entry: PlanEntry): string {
  return `${entry.skillTypeID}-${entry.targetLevel}`;
}

/**
 * Drop entries that repeat a (skill, level) another entry already covers,
 * keeping the first occurrence — the one invariant `entryId` needs. An entry
 * whose level a *lower*-positioned entry of the same skill already trains is
 * left alone: that is the ghost case, which the drag guard reports rather
 * than silently deleting the user's row.
 *
 * Used for queue import (ESI already sends one row per level trained, which
 * is exactly the shape this module wants) and defensively before persisting
 * any entry list.
 */
export function dedupeEntries(entries: readonly PlanEntry[]): PlanEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const id = entryId(entry);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Add a skill at a target level as its own row, unless the plan already
 * trains that skill to at least that level — an entry for a level an earlier
 * row already covers would render as a zero-time ghost.
 *
 * The row lands as a single entry at `targetLevel`; `splitEntriesByLevel`
 * (which alone knows the character's trained levels) is what expands it into
 * one row per level actually trained. Fields beyond skillTypeID/targetLevel
 * ride along, so this survives future fields.
 */
export function upsertEntry(entries: readonly PlanEntry[], entry: PlanEntry): PlanEntry[] {
  const covered = entries.some(
    (e) => e.skillTypeID === entry.skillTypeID && e.targetLevel >= entry.targetLevel
  );
  return covered ? [...entries] : [...entries, entry];
}

/** Remove one row — the skill's other levels stay where the user put them. */
export function removeEntry(
  entries: readonly PlanEntry[],
  skillTypeID: number,
  targetLevel: number
): PlanEntry[] {
  return entries.filter((e) => !(e.skillTypeID === skillTypeID && e.targetLevel === targetLevel));
}

/**
 * Set a skill's priority band (#27), leaving every other field untouched.
 *
 * Applies to every row of that skill on purpose: `effectivePriority` resolves
 * priority per skill, so the band a row is drawn under is the skill's, not
 * the row's. Letting "Mass Production IV" and "Mass Production V" hold
 * different pills would show two values that render as one band.
 */
export function setEntryPriority(
  entries: readonly PlanEntry[],
  skillTypeID: number,
  priority: PlanPriority
): PlanEntry[] {
  return entries.map((e) => (e.skillTypeID === skillTypeID ? { ...e, priority } : e));
}

/**
 * Rewrite user entries to match a "suggest reorder" result: sort entries by
 * where the suggested step order trains that exact (skill, level), so a
 * skill's own levels keep the order the suggestion put them in rather than
 * all landing together on their skill's first step.
 *
 * Falls back to that first step when the suggestion has no step for an
 * entry's exact level — an entry whose level is already trained contributes
 * no step, and dropping it to the end would reorder the plan on the strength
 * of a missing lookup. Entries whose skill is absent entirely (prereq-only)
 * sort to the end, stably.
 */
export function applyReorderSuggestion(
  entries: readonly PlanEntry[],
  suggestedSteps: readonly PlanStep[]
): PlanEntry[] {
  const byLevel = new Map<string, number>();
  const bySkill = new Map<number, number>();
  suggestedSteps.forEach((step, index) => {
    const key = `${step.skillTypeID}-${step.level}`;
    if (!byLevel.has(key)) byLevel.set(key, index);
    if (!bySkill.has(step.skillTypeID)) bySkill.set(step.skillTypeID, index);
  });
  const rank = (entry: PlanEntry): number =>
    byLevel.get(entryId(entry)) ?? bySkill.get(entry.skillTypeID) ?? Number.MAX_SAFE_INTEGER;
  return [...entries].sort((a, b) => rank(a) - rank(b));
}
