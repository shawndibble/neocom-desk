/**
 * Pure Skill Plan editing helpers, unit-testable without simulating real
 * drag events. Drag-and-drop reordering itself lives in markers.ts
 * (reorderRows), which handles entries and Remap Markers together.
 *
 * One entry per skill: PlanEntry has no id of its own, so `skillTypeID` (as a
 * string) doubles as the @dnd-kit sortable id. That only holds if entries are
 * deduped by skill; `upsertEntry` and `dedupeEntries` are the two places new
 * entries are ever introduced, so every caller must route through them.
 */
import type { PlanEntry, PlanPriority, PlanStep } from '@/engine/types';

/** Sortable id for an entry (dnd-kit needs a stable string per row). */
export function entryId(entry: PlanEntry): string {
  return String(entry.skillTypeID);
}

/**
 * Collapse entries to one per skill, keeping the highest targetLevel and the
 * position of that skill's *first* appearance. Other fields on the entry
 * (e.g. a future priority) come from that first-appearance entry, not
 * rebuilt from scratch. Used for queue import (one row per level trained)
 * and defensively before persisting any entry list.
 */
export function dedupeEntries(entries: readonly PlanEntry[]): PlanEntry[] {
  const order: number[] = [];
  const firstSeen = new Map<number, PlanEntry>();
  const maxLevel = new Map<number, number>();
  for (const entry of entries) {
    if (!firstSeen.has(entry.skillTypeID)) {
      order.push(entry.skillTypeID);
      firstSeen.set(entry.skillTypeID, entry);
    }
    maxLevel.set(
      entry.skillTypeID,
      Math.max(maxLevel.get(entry.skillTypeID) ?? 0, entry.targetLevel)
    );
  }
  return order.map((skillTypeID) => ({
    ...firstSeen.get(skillTypeID)!,
    targetLevel: maxLevel.get(skillTypeID)!,
  }));
}

/**
 * Add a skill at a target level, or raise an existing entry's target level if
 * the plan already trains that skill (never a duplicate row). Fields beyond
 * skillTypeID/targetLevel are merged in — the incoming entry's fields win,
 * falling back to the existing entry's — so this survives future fields.
 */
export function upsertEntry(entries: readonly PlanEntry[], entry: PlanEntry): PlanEntry[] {
  const index = entries.findIndex((e) => e.skillTypeID === entry.skillTypeID);
  if (index === -1) return [...entries, entry];
  const next = [...entries];
  next[index] = {
    ...next[index],
    ...entry,
    targetLevel: Math.max(next[index].targetLevel, entry.targetLevel),
  };
  return next;
}

export function removeEntry(entries: readonly PlanEntry[], skillTypeID: number): PlanEntry[] {
  return entries.filter((e) => e.skillTypeID !== skillTypeID);
}

/** Set one entry's own priority band (#27), leaving every other field untouched. */
export function setEntryPriority(
  entries: readonly PlanEntry[],
  skillTypeID: number,
  priority: PlanPriority
): PlanEntry[] {
  return entries.map((e) => (e.skillTypeID === skillTypeID ? { ...e, priority } : e));
}

/**
 * Rewrite user entries to match a "suggest reorder" result: sort entries by
 * the first occurrence of their skill in the suggested step order, preserving
 * each entry's own targetLevel. Steps for prereq-only skills (not user
 * entries) are ignored.
 */
export function applyReorderSuggestion(
  entries: readonly PlanEntry[],
  suggestedSteps: readonly PlanStep[]
): PlanEntry[] {
  const firstIndex = new Map<number, number>();
  suggestedSteps.forEach((step, index) => {
    if (!firstIndex.has(step.skillTypeID)) firstIndex.set(step.skillTypeID, index);
  });
  return [...entries].sort((a, b) => {
    const ai = firstIndex.get(a.skillTypeID) ?? Number.MAX_SAFE_INTEGER;
    const bi = firstIndex.get(b.skillTypeID) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}
