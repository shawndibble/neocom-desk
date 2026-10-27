import type { ReactNode } from 'react';

/** What `Travel` hands each of its tabs: the tab strip and its id base. */
export interface TravelTabProps {
  tabBar: ReactNode;
  tabsId: string;
}
