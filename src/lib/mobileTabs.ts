import { NAV_PAGES, navPageLabelKey } from '@/app/navDestinations';
import { createLocalSetting } from './useLocalSetting';

export const MOBILE_TABS_KEY = 'mobileTabs';

type MobileTabPage = Extract<(typeof NAV_PAGES)[number], { mobileTab: true }>;

export type MobileTabPath = MobileTabPage['path'];

export const MOBILE_TAB_CHOICES: readonly MobileTabPath[] = NAV_PAGES.filter(
  (page): page is MobileTabPage => page.mobileTab
).map((page) => page.path);

export const MOBILE_TAB_COUNT = 4;

export const DEFAULT_MOBILE_TABS: readonly MobileTabPath[] = [
  '/overview',
  '/skills',
  '/industry',
  '/market',
];

export const NAV_LABEL_KEYS = Object.fromEntries(
  MOBILE_TAB_CHOICES.map((path) => [path, navPageLabelKey(path)])
) as Record<MobileTabPath, string>;

function isMobileTabPath(value: unknown): value is MobileTabPath {
  return (MOBILE_TAB_CHOICES as readonly string[]).includes(value as string);
}

const LEGACY_PATH_REMAP: Record<string, MobileTabPath> = {
  '/moon-mining': '/mining',
  '/fittings': '/ships',
};

function remapLegacyPath(value: unknown): unknown {
  return typeof value === 'string' && value in LEGACY_PATH_REMAP ? LEGACY_PATH_REMAP[value] : value;
}

export function sortMobileTabs(paths: readonly MobileTabPath[]): MobileTabPath[] {
  return MOBILE_TAB_CHOICES.filter((path) => paths.includes(path));
}

export function barTabs(tabs: readonly MobileTabPath[]): MobileTabPath[] {
  return parseMobileTabs([...tabs]) ?? [...DEFAULT_MOBILE_TABS];
}

export function parseMobileTabs(raw: unknown): MobileTabPath[] | null {
  if (!Array.isArray(raw) || raw.length !== MOBILE_TAB_COUNT) return null;
  const remapped = raw.map(remapLegacyPath);
  if (!remapped.every(isMobileTabPath)) return null;
  if (new Set(remapped).size !== remapped.length) return null;
  return sortMobileTabs(remapped);
}

export const useMobileTabs = createLocalSetting<readonly MobileTabPath[]>({
  key: MOBILE_TABS_KEY,
  defaultValue: DEFAULT_MOBILE_TABS,
  parse: parseMobileTabs,
});
