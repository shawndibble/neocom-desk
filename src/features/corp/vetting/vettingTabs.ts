import { VETTING_RAW_SOURCES, type VettingRawSource } from '@/engine/vetting';
import { definePageTabs } from '@/lib/pageTabs';
import { VETTING_SETTINGS_SECTIONS, type VettingSettingsSection } from './vettingSettingsForm';

export const VETTING_TABS = definePageTabs('/corp/vetting', [
  { id: 'open', labelKey: 'vetting.tabs.open', deep: true },
  { id: 'decided', labelKey: 'vetting.tabs.decided', deep: true },
  { id: 'settings', labelKey: 'vetting.tabs.settings', deep: true, standalone: true },
]);

export type VettingTabId = (typeof VETTING_TABS.tabs)[number]['id'];

export function reviewIdFromPathname(pathname: string): string | null {
  const match = /^\/corp\/vetting\/(?:open|decided)\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function reviewPath(tab: 'open' | 'decided', reviewId: string): string {
  return `${VETTING_TABS.base}/${tab}/${encodeURIComponent(reviewId)}`;
}

export function settingsSectionFromPathname(pathname: string): VettingSettingsSection {
  const match = /^\/corp\/vetting\/settings\/([^/]+)\/?$/.exec(pathname);
  return VETTING_SETTINGS_SECTIONS.find((section) => section === match?.[1]) ?? 'general';
}

export function settingsSectionPath(section: VettingSettingsSection): string {
  return `${VETTING_TABS.base}/settings/${section}`;
}

export function dataFromPathname(
  pathname: string
): { tab: 'open' | 'decided'; reviewId: string; source: VettingRawSource } | null {
  const match = /^\/corp\/vetting\/(open|decided)\/([^/]+)\/data(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!match) return null;
  const source = VETTING_RAW_SOURCES.find((candidate) => candidate === match[3]);
  return {
    tab: match[1] as 'open' | 'decided',
    reviewId: decodeURIComponent(match[2] ?? ''),
    source: source ?? VETTING_RAW_SOURCES[0],
  };
}

export function dataPath(
  tab: 'open' | 'decided',
  reviewId: string,
  source: VettingRawSource
): string {
  return `${reviewPath(tab, reviewId)}/data/${source}`;
}
