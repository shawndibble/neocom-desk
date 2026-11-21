/**
 * The one hub picker (issue #6523): a radio menu that says where a page's
 * Trade Hub comes from and changes it. At the top, **Global · <page>**: which
 * one the page uses, and a press switches it (the page's own entry starts at
 * the hub it uses now; Global drops the entry). Below a divider, the hubs, the
 * one in use ticked: a pick writes the page's own entry when it has one, else
 * the Global hub, which moves every page without an entry.
 *
 * A scope press keeps the menu open, since the next thing wanted is usually a
 * hub; a hub press closes it. The trigger is the caller's (DESIGN.md §6c: an
 * accent dashed-underline value inline in a readout, field chrome standing
 * alone), so the menu itself reads the same everywhere.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { selectTriggerClassName, type ControlSize } from '@/components/ui/controlStyles';
import { SelectChevron } from '@/components/ui/SelectChevron';
import { cx } from '@/lib/cx';
import { DEFAULT_TRADE_HUB, getTradeHub, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { loadHubFor, pickHubFor, setHubScope, useHubFor, type HubScope } from './hub';
import { CLOSEST, pageHubAreaName, type HubChoice, type PageHubArea } from './pageHubs';

/** An option a page lists after the hubs, in the same radio group (PI's corp buyback). */
export interface HubMenuOption {
  value: string;
  label: string;
  onSelect: () => void;
}

/** What changed: a hub was picked, or the page moved between Global and its own hub. */
export type HubPickKind = 'hub' | 'scope';

export function HubMenu({
  area,
  triggerClassName,
  triggerLabel,
  shownHubId,
  onPicked,
  extraOptions = [],
  selectedOption,
  triggerId,
  children,
}: {
  area: PageHubArea;
  /** The hub on screen when it is not the stored one (a Market link naming a hub); ticked instead. */
  shownHubId?: TradeHub['id'];
  /** After a hub pick (or a scope switch) is written, with the hub now in use: for a page that also points its URL at it. */
  onPicked?: (hubId: TradeHub['id'], kind: HubPickKind) => void;
  /** Options after the hubs; picking one runs its `onSelect` and writes no hub. */
  extraOptions?: readonly HubMenuOption[];
  /** The `extraOptions` value in force, ticked instead of the hub. */
  selectedOption?: string;
  triggerClassName?: string;
  triggerId?: string;
  /** The trigger's accessible name; it starts with the visible hub (WCAG 2.5.3). */
  triggerLabel: string;
  /** The trigger's visible content, usually the hub's name. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { hubId, choice, scope } = useHubFor(area);
  // A hub on screen other than the stored one (a link's) is ticked; the stored one ticks what it is set to.
  const ticked = shownHubId !== undefined && shownHubId !== hubId ? shownHubId : choice;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger id={triggerId} className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={scope}
          aria-label={t('pageHubs.scopeLabel')}
          onValueChange={(next) => {
            // After the switch the page may use another hub (Global's): report it like a pick.
            void setHubScope(area, next as HubScope)
              .then(() => loadHubFor(area))
              .then((hub) => onPicked?.(hub, 'scope'));
          }}
        >
          {/* preventDefault keeps the menu open; Radix still fires onValueChange for a radio item. */}
          <DropdownMenuRadioItem value="global" onSelect={(e) => e.preventDefault()}>
            {t('pageHubs.global')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="page" onSelect={(e) => e.preventDefault()}>
            {pageHubAreaName(t, area)}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={selectedOption ?? ticked}
          aria-label={t('pageHubs.hubLabel')}
          onValueChange={(next) => {
            const option = extraOptions.find((each) => each.value === next);
            if (option) return option.onSelect();
            if (next === CLOSEST) {
              // Report the hub Closest finds, once it is written and worked out.
              void pickHubFor(area, CLOSEST)
                .then(() => loadHubFor(area))
                .then((hub) => onPicked?.(hub, 'hub'));
              return;
            }
            void pickHubFor(area, next as HubChoice);
            onPicked?.(next as TradeHub['id'], 'hub');
          }}
        >
          <DropdownMenuRadioItem value={CLOSEST}>{t('pageHubs.closest')}</DropdownMenuRadioItem>
          {TRADE_HUBS.map((hub) => (
            <DropdownMenuRadioItem key={hub.id} value={hub.id}>
              {hub.stationLabel}
            </DropdownMenuRadioItem>
          ))}
          {extraOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * `HubMenu` standing alone as a control: field chrome with the hub's name and
 * the chevron (DESIGN.md §6c, `CaretDown` inside field chrome), where a page
 * used to have a hub `Select`.
 */
export function HubField({
  area,
  label,
  size = 'md',
  className,
  shownHubId,
  onPicked,
  extraOptions,
  selectedOption,
  id,
}: {
  area: PageHubArea;
  shownHubId?: TradeHub['id'];
  onPicked?: (hubId: TradeHub['id'], kind: HubPickKind) => void;
  extraOptions?: readonly HubMenuOption[];
  /** The `extraOptions` value in force: the field shows its label in place of the hub. */
  selectedOption?: string;
  /** For a `Field`'s `htmlFor`. */
  id?: string;
  /** What the field picks ("Priced at"); the trigger is named "<hub>, <label>" so it starts with what shows. */
  label: string;
  size?: ControlSize;
  className?: string;
}) {
  const { t } = useTranslation();
  const { hubId, closestFound } = useHubFor(area);
  const hub = getTradeHub(shownHubId ?? hubId) ?? DEFAULT_TRADE_HUB;
  const shown =
    extraOptions?.find((option) => option.value === selectedOption)?.label ??
    (closestFound && (shownHubId === undefined || shownHubId === hubId)
      ? t('pageHubs.closestFound', { hub: hub.systemName })
      : hub.systemName);
  return (
    <HubMenu
      area={area}
      shownHubId={shownHubId}
      onPicked={onPicked}
      extraOptions={extraOptions}
      selectedOption={selectedOption}
      triggerId={id}
      triggerClassName={cx(selectTriggerClassName(size), className)}
      triggerLabel={t('pageHubs.fieldLabel', { hub: shown, label })}
    >
      <span>{shown}</span>
      <SelectChevron size={size} />
    </HubMenu>
  );
}
