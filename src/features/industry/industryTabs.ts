/**
 * The Industry section's 4-tab strip, shared by the index (`Industry.tsx`,
 * where each tab is its own path, `/industry/<tab>` — ADR 0015) and the plan/
 * group detail pages (`IndustryPlanPage.tsx`, `IndustryGroupPage.tsx`, where
 * it's the same strip pinned above the page — a plan or group is still
 * conceptually "inside" Build Plans, so the strip must keep showing which
 * section this page belongs to, not just a bare back link).
 */
import type { TFunction } from 'i18next';
import { definePageTabs, tabPath } from '@/lib/pageTabs';

export type IndustryTab = 'plans' | 'records' | 'sourcing' | 'opportunities';

export const INDUSTRY_TABS = definePageTabs<IndustryTab>('/industry', [
  { id: 'plans', labelKey: 'industry.buildPlansTab' },
  { id: 'records', labelKey: 'industry.recordsTab' },
  { id: 'sourcing', labelKey: 'industry.bpcSearchTab' },
  { id: 'opportunities', labelKey: 'industry.opportunitiesTab' },
]);

export function industryTabs(t: TFunction): { id: IndustryTab; label: string }[] {
  return INDUSTRY_TABS.tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }));
}

/** A tab's own path — where clicking it from a plan/group detail page goes. */
export function industryTabHref(id: IndustryTab): string {
  return tabPath(INDUSTRY_TABS, id);
}
