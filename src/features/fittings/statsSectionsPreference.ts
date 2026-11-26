import { createLocalSetting } from '@/lib/useLocalSetting';

export const STATS_SECTIONS_SETTING_KEY = 'fittingsStatsSections';

export type StatsSectionsOpen = Record<string, boolean>;

export function parseStatsSections(raw: unknown): StatsSectionsOpen | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
  );
}

export const useStatsSectionsPreference = createLocalSetting<StatsSectionsOpen>({
  key: STATS_SECTIONS_SETTING_KEY,
  defaultValue: {},
  parse: parseStatsSections,
});

export function isSectionExpanded(
  stored: StatsSectionsOpen,
  sectionId: string,
  { isPhone, openByDefault }: { isPhone: boolean; openByDefault: boolean }
): boolean {
  return stored[sectionId] ?? (isPhone ? false : openByDefault);
}

export function withSectionExpanded(
  stored: StatsSectionsOpen,
  sectionId: string,
  open: boolean
): StatsSectionsOpen {
  return { ...stored, [sectionId]: open };
}
