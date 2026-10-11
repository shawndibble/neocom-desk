import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, PageHeader, TabPanel } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { HaulingPanel, type HaulingRefreshInfo } from '@/features/market/HaulingPanel';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { TravelTabProps } from './travelTab';

/**
 * Travel's Hauling tab (#3526, moved from Market): Hauling Opportunities
 * between Trade Hubs. The panel picks its own From/To hubs, so it needs no
 * hub control from the page; its reload sits in the title bar beside
 * "Travel", and its rows' item menus need this page's item actions.
 */
export function HaulingTab({ tabBar, tabsId, views }: TravelTabProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const itemActions = usePageItemActions({ activeCharacterId, lazyBlueprints: true });
  const [refresh, setRefresh] = useState<HaulingRefreshInfo | null>(null);

  return (
    <ItemActionsProvider page={itemActions}>
      <div className="space-y-4">
        <PageHeader
          title={t('travel.title')}
          views={views}
          actions={
            refresh ? (
              <IconButton
                icon={<Icon.Refresh />}
                label={t('market.refresh')}
                onClick={refresh.refresh}
                disabled={refresh.disabled}
              />
            ) : undefined
          }
        />
        {tabBar}
        <TabPanel tabsId={tabsId} tabId="hauling" className="space-y-4">
          <HaulingPanel onRefreshInfoChange={setRefresh} />
        </TabPanel>
      </div>
    </ItemActionsProvider>
  );
}
