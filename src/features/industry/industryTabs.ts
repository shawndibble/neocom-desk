import type { TFunction } from 'i18next';
import { definePageTabs, tabPath } from '@/lib/pageTabs';

export type IndustryTab = 'plans' | 'logs' | 'sourcing' | 'opportunities';

export const INDUSTRY_TABS = definePageTabs<IndustryTab>('/industry', [
  { id: 'plans', labelKey: 'industry.buildPlansTab' },
  { id: 'logs', labelKey: 'industry.logsTab' },
  { id: 'sourcing', labelKey: 'industry.bpcSearchTab' },
  { id: 'opportunities', labelKey: 'industry.opportunitiesTab' },
]);

export function industryTabs(
  t: TFunction,
  { showLogs, activeTab }: { showLogs: boolean; activeTab?: IndustryTab }
): { id: IndustryTab; label: string }[] {
  return INDUSTRY_TABS.tabs
    .filter((tab) => tab.id !== 'logs' || showLogs || activeTab === 'logs')
    .map((tab) => ({ id: tab.id, label: t(tab.labelKey) }));
}

export function industryTabHref(id: IndustryTab): string {
  return tabPath(INDUSTRY_TABS, id);
}

export const INDUSTRY_TABS_ID = 'industry-tabs';
