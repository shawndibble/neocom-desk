/**
 * Settings › Market defaults › Page hubs (issue #6523): the pages that price at
 * a Trade Hub of their own instead of the default. One row per page, its hub
 * select and Remove; Add page hub lists only the pages without one, and a new
 * entry starts at the hub that page uses now, so adding re-prices nothing.
 * Remove puts the page back on the default hub, with Undo.
 *
 * The same entries the in-page `HubMenu` switches between Global and the page.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Toast,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useMarketHub } from '@/features/market/hub';
import {
  dropPageHub,
  PAGE_HUB_AREAS,
  setPageHub,
  usePageHubs,
  type PageHubArea,
  type PageHubMap,
} from '@/features/market/pageHubs';
import type { HubId } from '@/features/market/characterHubs';
import { HubSelect } from './TradeHubField';

type Removed = { area: PageHubArea; hub: HubId };

function write(edit: (map: PageHubMap) => PageHubMap) {
  const store = usePageHubs.getState();
  return store.setValue(edit(store.value));
}

/** Reads settled stores; the caller waits for `usePageHubs` and `useMarketHub` to hydrate. */
export function PageHubsField() {
  const { t } = useTranslation();
  const map = usePageHubs((state) => state.value);
  const globalHub = useMarketHub((state) => state.value);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const set = PAGE_HUB_AREAS.filter((area) => map[area]);
  const unset = PAGE_HUB_AREAS.filter((area) => !map[area]);
  const name = (area: PageHubArea) => t(`pageHubs.area.${area}`);

  return (
    <Field label={t('settings.pageHubsLabel')} note={t('settings.pageHubsNote')}>
      <div className="min-w-0 space-y-2">
        {set.length > 0 && (
          <ul className="divide-y divide-line">
            {set.map((area) => (
              <li
                key={area}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 sm:flex-nowrap"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{name(area)}</span>
                <div className="flex w-full items-center gap-2 sm:w-80">
                  <div className="min-w-0 flex-1 [&_button]:w-full">
                    <HubSelect
                      size="sm"
                      value={map[area]!}
                      label={t('settings.pageHubFor', { page: name(area) })}
                      onChange={(hub) => void write((m) => setPageHub(m, area, hub))}
                    />
                  </div>
                  <Button
                    size="sm"
                    aria-label={t('settings.pageHubRemoveFor', { page: name(area) })}
                    onClick={() => {
                      setRemoved({ area, hub: map[area]! });
                      void write((m) => dropPageHub(m, area));
                    }}
                  >
                    {t('settings.pageHubRemove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {unset.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('settings.pageHubAdd')}
                <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {unset.map((area) => (
                <DropdownMenuItem
                  key={area}
                  onSelect={() => void write((m) => setPageHub(m, area, globalHub))}
                >
                  {name(area)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {removed !== null && (
        <Toast
          message={t('settings.pageHubRemoved', { page: name(removed.area) })}
          undo={{
            label: t('settings.pageHubUndo'),
            onUndo: () => void write((m) => setPageHub(m, removed.area, removed.hub)),
          }}
          onClose={() => setRemoved(null)}
        />
      )}
    </Field>
  );
}
