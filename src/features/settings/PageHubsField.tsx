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
import { useGlobalClosest, useMarketHub } from '@/features/market/hub';
import {
  CLOSEST,
  dropPageHub,
  ownChoice,
  pageHubAreaName,
  PAGE_HUB_AREAS,
  setPageHub,
  usePageHubs,
  useParkedPageHubs,
  type HubChoice,
  type PageHubArea,
  type PageHubMap,
} from '@/features/market/pageHubs';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { HubSelect } from './TradeHubField';

type Removed = { area: PageHubArea; hub: HubChoice; parked: boolean };

function write(edit: (map: PageHubMap) => PageHubMap, parked = false) {
  const store = (parked ? useParkedPageHubs : usePageHubs).getState();
  return store.setValue(edit(store.value));
}

export function PageHubsField() {
  const { t } = useTranslation();
  const map = usePageHubs((state) => state.value);
  const parkedMap = useParkedPageHubs((state) => state.value);
  const globalHub = useMarketHub((state) => state.value);
  const globalChoice: HubChoice = useGlobalClosest((state) => state.value) ? CLOSEST : globalHub;
  const [removed, setRemoved] = useState<Removed | null>(null);
  const removeRefs = useRef(new Map<PageHubArea, HTMLButtonElement>());
  const addRef = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  const parked = (area: PageHubArea) => !ownChoice(map, area);
  const own = (area: PageHubArea) => (ownChoice(map, area) ?? ownChoice(parkedMap, area))!;
  const hasOwn = (area: PageHubArea) => Boolean(ownChoice(map, area) ?? ownChoice(parkedMap, area));
  const set = PAGE_HUB_AREAS.filter(hasOwn);
  const unset = PAGE_HUB_AREAS.filter((area) => !hasOwn(area));
  const name = (area: PageHubArea) => pageHubAreaName(t, area);
  const add = (area: PageHubArea) => void write((m) => setPageHub(m, area, globalChoice));

  function remove(area: PageHubArea, index: number) {
    const near = [set[index + 1], set[index - 1]].map(
      (key) => () => (key === undefined ? null : (removeRefs.current.get(key) ?? null))
    );
    focusAfterCommit(...near, () => addRef.current);
    setRemoved({ area, hub: own(area), parked: parked(area) });
    void write((m) => dropPageHub(m, area));
    void write((m) => dropPageHub(m, area), true);
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
                <span className="min-w-0 flex-1 truncate text-sm">
                  {name(area)}
                  {parked(area) && (
                    <span className="block text-xs text-text-dim">
                      {t('settings.pageHubParked')}
                    </span>
                  )}
                </span>
                <div className="flex w-full items-center gap-2 sm:w-80">
                  <div className="min-w-0 flex-1 [&_button]:w-full">
                    <HubSelect<HubChoice>
                      size="sm"
                      closest
                      value={own(area)}
                      label={t('settings.pageHubFor', { page: name(area) })}
                      onChange={(hub) => void write((m) => setPageHub(m, area, hub), parked(area))}
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
          message={t(removed.parked ? 'settings.pageHubRemovedParked' : 'settings.pageHubRemoved', {
            page: name(removed.area),
          })}
          undo={{
            label: t('settings.pageHubUndo'),
            onUndo: () => {
              setRemoved(null);
              void write((m) => setPageHub(m, removed.area, removed.hub), removed.parked);
            },
          }}
          onClose={() => setRemoved(null)}
        />
      )}
    </Field>
  );
}
