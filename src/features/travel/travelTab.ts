import type { ReactNode } from 'react';
import type { PageViews } from '@/components/ui';

/**
 * What `Travel` hands each of its tabs. Travel has 4+ tabs, so on a phone
 * `views` turns the tab's `PageHeader` title into the view picker and
 * `tabBar` is null (DESIGN.md §6c); elsewhere `tabBar` is the strip.
 */
export interface TravelTabProps {
  tabBar: ReactNode;
  tabsId: string;
  views: PageViews;
}
