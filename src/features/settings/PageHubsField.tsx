/**
 * Settings › Market defaults › Page hubs (issue #6523): the pages that price at
 * a Trade Hub of their own instead of the Global hub. One row per page, its hub
 * select and Remove; Add lists only the pages without one (a menu once there
 * are several, a plain button for one), and a new entry starts at the hub that
 * page uses now, so adding re-prices nothing. Remove puts the page back on the
 * Global hub, with Undo; focus moves to the next row, else the previous one,
 * else the Add control (DESIGN.md "Removing a row").
 *
 * The same entries the in-page `HubMenu` switches between Global and the page.
 */
import { useRef, useState } from 'react';
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
  ownHub,
  pageHubAreaName,
  PAGE_HUB_AREAS,
  setPageHub,
  usePageHubs,
  type PageHubArea,
  type PageHubMap,
} from '@/features/market/pageHubs';
import type { HubId } from '@/features/market/characterHubs';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
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
  const removeRefs = useRef(new Map<PageHubArea, HTMLButtonElement>());
  const addRef = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  // Only areas with an entry this build reads are listed, so `own(area)` is set for each.
  const own = (area: PageHubArea) => ownHub(map, area)!;
  const set = PAGE_HUB_AREAS.filter((area) => ownHub(map, area));
  const unset = PAGE_HUB_AREAS.filter((area) => !ownHub(map, area));
  const name = (area: PageHubArea) => pageHubAreaName(t, area);
  const add = (area: PageHubArea) => void write((m) => setPageHub(m, area, globalHub));

  function remove(area: PageHubArea, index: number) {
    const near = [set[index + 1], set[index - 1]].map(
      (key) => () => (key === undefined ? null : (removeRefs.current.get(key) ?? null))
    );
    focusAfterCommit(...near, () => addRef.current);
    setRemoved({ area, hub: own(area) });
    void write((m) => dropPageHub(m, area));
  }

  return (
    <Field label={t('settings.pageHubsLabel')} note={t('settings.pageHubsNote')}>
      <div className="min-w-0 space-y-2">
        {set.length > 0 && (
          <ul className="divide-y divide-line">
            {set.map((area, index) => (
              <li
                key={area}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 sm:flex-nowrap"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{name(area)}</span>
                <div className="flex w-full items-center gap-2 sm:w-80">
                  <div className="min-w-0 flex-1 [&_button]:w-full">
                    <HubSelect
                      size="sm"
                      value={own(area)}
                      label={t('settings.pageHubFor', { page: name(area) })}
                      onChange={(hub) => void write((m) => setPageHub(m, area, hub))}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    ref={(el) => {
                      if (el) removeRefs.current.set(area, el);
                      else removeRefs.current.delete(area);
                    }}
                    aria-label={t('settings.pageHubRemoveFor', { page: name(area) })}
                    onClick={() => remove(area, index)}
                  >
                    {t('settings.pageHubRemove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {unset.length === 1 && (
          <Button ref={addRef} variant="ghost" size="sm" onClick={() => add(unset[0]!)}>
            {t('settings.pageHubAddOne', { page: name(unset[0]!) })}
          </Button>
        )}
        {unset.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ref={addRef} variant="ghost" size="sm">
                {t('settings.pageHubAdd')}
                <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {unset.map((area) => (
                <DropdownMenuItem key={area} onSelect={() => add(area)}>
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
            onUndo: () => {
              setRemoved(null);
              void write((m) => setPageHub(m, removed.area, removed.hub));
            },
          }}
          onClose={() => setRemoved(null)}
        />
      )}
    </Field>
  );
}
