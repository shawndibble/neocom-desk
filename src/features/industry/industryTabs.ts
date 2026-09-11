/**
 * The Industry section's 4-tab strip, shared by the index (`Industry.tsx`,
 * where it's the real controlled `Tabs` switching `?tab=`) and the plan/
 * group detail pages (`IndustryPlanPage.tsx`, `IndustryGroupPage.tsx`, where
 * it's the same strip pinned above the page — a plan or group is still
 * conceptually "inside" Build Plans, so the strip must keep showing which
 * section this page belongs to, not just a bare back link).
 */
import type { TFunction } from 'i18next';

export type IndustryTab = 'plans' | 'records' | 'sourcing' | 'opportunities';

/** An unknown or absent `?tab=` falls back to Plans rather than rendering nothing — a stale or hand-edited link should land somewhere useful. */
export function readIndustryTab(value: string | null): IndustryTab {
  return value === 'records' || value === 'sourcing' || value === 'opportunities' ? value : 'plans';
}

export function industryTabs(t: TFunction): { id: IndustryTab; label: string }[] {
  return [
    { id: 'plans', label: t('industry.buildPlansTab') },
    { id: 'records', label: t('industry.recordsTab') },
    { id: 'sourcing', label: t('industry.bpcSearchTab') },
    { id: 'opportunities', label: t('industry.opportunitiesTab') },
  ];
}

/** Where clicking a tab from a plan/group detail page (always "plans" itself) goes. */
export function industryTabHref(id: IndustryTab): string {
  return id === 'plans' ? '/industry' : `/industry?tab=${id}`;
}
