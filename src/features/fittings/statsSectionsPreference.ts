/**
 * Which Fittings stats sections the pilot keeps open (Offense, Defense,
 * Mining…): one device-local map of section id → open, like the Ring | List
 * choice (`fittingViewPreference.ts`) — a view preference, never in the URL.
 * A section the pilot has never toggled has no entry and takes the layout's
 * default: open or collapsed as the section list says on desktop, collapsed
 * on a phone. Ids are the stable section ids the stats column uses, so a
 * section added later starts at its default without resetting the rest.
 */
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
