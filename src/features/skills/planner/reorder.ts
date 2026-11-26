import type { PlanEntry, PlanPriority, PlanStep } from '@/engine/types';

export function entryId(entry: PlanEntry): string {
  return `${entry.skillTypeID}-${entry.targetLevel}`;
}

export function dedupeEntries(entries: readonly PlanEntry[]): PlanEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const id = entryId(entry);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function isEntryCovered(
  entries: readonly PlanEntry[],
  skillTypeID: number,
  targetLevel: number
): boolean {
  return entries.some((e) => e.skillTypeID === skillTypeID && e.targetLevel >= targetLevel);
}

export function plannedLevelFor(entries: readonly PlanEntry[], skillTypeID: number): number | null {
  const levels = entries.filter((e) => e.skillTypeID === skillTypeID).map((e) => e.targetLevel);
  return levels.length === 0 ? null : Math.max(...levels);
}

export function upsertEntry(entries: readonly PlanEntry[], entry: PlanEntry): PlanEntry[] {
  return isEntryCovered(entries, entry.skillTypeID, entry.targetLevel)
    ? [...entries]
    : [...entries, entry];
}

export function appendImportedEntries(
  existing: readonly PlanEntry[],
  imported: readonly PlanEntry[]
): PlanEntry[] {
  return imported.reduce<PlanEntry[]>((acc, entry) => upsertEntry(acc, entry), [...existing]);
}

export function removeEntry(
  entries: readonly PlanEntry[],
  skillTypeID: number,
  targetLevel: number
): PlanEntry[] {
  return entries.filter((e) => !(e.skillTypeID === skillTypeID && e.targetLevel === targetLevel));
}

export function setEntryPriority(
  entries: readonly PlanEntry[],
  skillTypeID: number,
  priority: PlanPriority
): PlanEntry[] {
  return entries.map((e) => (e.skillTypeID === skillTypeID ? { ...e, priority } : e));
}

export function applyReorderSuggestion(
  entries: readonly PlanEntry[],
  suggestedSteps: readonly PlanStep[]
): PlanEntry[] {
  const byLevel = new Map<string, number>();
  const bySkill = new Map<number, number>();
  suggestedSteps.forEach((step, index) => {
    const key = entryId({ skillTypeID: step.skillTypeID, targetLevel: step.level });
    if (!byLevel.has(key)) byLevel.set(key, index);
    if (!bySkill.has(step.skillTypeID)) bySkill.set(step.skillTypeID, index);
  });
  const rank = (entry: PlanEntry): number =>
    byLevel.get(entryId(entry)) ?? bySkill.get(entry.skillTypeID) ?? Number.MAX_SAFE_INTEGER;
  return [...entries].sort((a, b) => rank(a) - rank(b));
}
