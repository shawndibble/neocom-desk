import { createLocalSetting } from '@/lib/useLocalSetting';

export interface SavedComparison {
  id: string;
  name: string;
  characterIds: number[];
}

export interface SkillComparisonsValue {
  items: SavedComparison[];
  updatedAt: number;
}

export const SKILL_COMPARISONS_SETTING_KEY = 'skillComparisons';

const DEFAULT_VALUE: SkillComparisonsValue = { items: [], updatedAt: 0 };

function isSavedComparison(value: unknown): value is SavedComparison {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SavedComparison>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.characterIds) &&
    candidate.characterIds.every((id) => typeof id === 'number')
  );
}

function parseComparisonsValue(raw: unknown): SkillComparisonsValue | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Partial<SkillComparisonsValue>;
  if (!Array.isArray(candidate.items) || !candidate.items.every(isSavedComparison)) return null;
  if (typeof candidate.updatedAt !== 'number') return null;
  return { items: candidate.items, updatedAt: candidate.updatedAt };
}

export const useSkillComparisons = createLocalSetting<SkillComparisonsValue>({
  key: SKILL_COMPARISONS_SETTING_KEY,
  defaultValue: DEFAULT_VALUE,
  parse: parseComparisonsValue,
});

export function upsertComparison(
  value: SkillComparisonsValue,
  comparison: SavedComparison,
  nowMs: number
): SkillComparisonsValue {
  const exists = value.items.some((item) => item.id === comparison.id);
  const items = exists
    ? value.items.map((item) => (item.id === comparison.id ? comparison : item))
    : [...value.items, comparison];
  return { items, updatedAt: nowMs };
}

export function removeComparison(
  value: SkillComparisonsValue,
  id: string,
  nowMs: number
): SkillComparisonsValue {
  return { items: value.items.filter((item) => item.id !== id), updatedAt: nowMs };
}

export function resolveComparisonCharacterIds(
  comparison: Pick<SavedComparison, 'characterIds'>,
  knownCharacterIds: ReadonlySet<number>
): number[] {
  return comparison.characterIds.filter((id) => knownCharacterIds.has(id));
}
