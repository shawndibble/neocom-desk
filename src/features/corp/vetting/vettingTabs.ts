import { definePageTabs } from '@/lib/pageTabs';
import { VETTING_SETTINGS_SECTIONS, type VettingSettingsSection } from './vettingSettingsForm';

/**
 * `/corp/vetting`'s tabs (ADR 0015), in bar order. Open and Decided each own the path below
 * them: `/corp/vetting/open/<reviewId>` is that review's report, which `VettingPage` draws as a
 * page of its own. Settings is listed only for a Director (`canConfigure`); the path below it
 * names one of its sections (`/corp/vetting/settings/applicants`), so a section can be linked.
 */
export const VETTING_TABS = definePageTabs('/corp/vetting', [
  { id: 'open', labelKey: 'vetting.tabs.open', deep: true },
  { id: 'decided', labelKey: 'vetting.tabs.decided', deep: true },
  { id: 'settings', labelKey: 'vetting.tabs.settings', deep: true },
]);

export type VettingTabId = (typeof VETTING_TABS.tabs)[number]['id'];

/** The review a path below Open or Decided names, or null for the tab itself. */
export function reviewIdFromPathname(pathname: string): string | null {
  const match = /^\/corp\/vetting\/(?:open|decided)\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function reviewPath(tab: 'open' | 'decided', reviewId: string): string {
  return `${VETTING_TABS.base}/${tab}/${encodeURIComponent(reviewId)}`;
}

/** The settings section a path names; the first one for the tab itself or anything unknown. */
export function settingsSectionFromPathname(pathname: string): VettingSettingsSection {
  const match = /^\/corp\/vetting\/settings\/([^/]+)\/?$/.exec(pathname);
  return VETTING_SETTINGS_SECTIONS.find((section) => section === match?.[1]) ?? 'general';
}

export function settingsSectionPath(section: VettingSettingsSection): string {
  return `${VETTING_TABS.base}/settings/${section}`;
}
