/**
 * The one hub picker (issues #6523, #6531): a popover that says where a page's
 * Trade Hub comes from, changes it, and holds the page's price percent.
 *
 * - **Market hub settings**: App setting · <page>, which one the page uses; a
 *   press switches it and keeps both (App setting sets the page's own hub
 *   aside, and the page gets it back; a page with none starts at the hub it
 *   uses now). Only Settings › Page hubs removes a page's own hub.
 * - **Market hub**: Closest hub on its own row, then the hubs in a grid, the
 *   one in use pressed. A pick writes the page's own entry when it has one,
 *   else the Global hub, which moves every page without an entry.
 * - **Buy percent / Sell percent** (`pagePricePercents.ts`): the page's own,
 *   whichever hub it uses. The page says which side it prices on; that only
 *   names the field. Absent on a page with no percent (`hasPercentField`).
 *
 * A hub press closes the popover; the switch and the percent keep it open. It
 * is a popover rather than a menu because it holds a text field, whose own
 * keys a menu's typeahead would take (DESIGN.md `Popover`).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  TextInput,
} from '@/components/ui';
import {
  controlHeightClassName,
  focusRingClassName,
  interactiveClassName,
  selectTriggerClassName,
  toggleChipStateClassName,
  type ControlSize,
} from '@/components/ui/controlStyles';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { SelectChevron } from '@/components/ui/SelectChevron';
import { cx } from '@/lib/cx';
import { DEFAULT_TRADE_HUB, getTradeHub, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { loadHubFor, pickHubFor, setHubScope, useHubFor, type HubScope } from './hub';
import { CLOSEST, pageHubAreaName, type HubChoice, type PageHubArea } from './pageHubs';
import {
  hasPercentField,
  setPricePercentFor,
  usePricePercentFor,
  withPercent,
} from './pagePricePercents';
import { isValidPricePercent } from './pricePercent';

/** What changed: a hub was picked, or the page moved between Global and its own hub. */
export type HubPickKind = 'hub' | 'scope';

/** Which prices the page shows right now: names the percent field Buy percent or Sell percent. */
export type PriceSide = 'buy' | 'sell';

export function HubMenu({
  area,
  side,
  triggerClassName,
  triggerLabel,
  shownHubId,
  onPicked,
  triggerId,
  children,
}: {
  area: PageHubArea;
  /** The side the page prices on; without it the popover has no percent field. */
  side?: PriceSide;
  /** The hub on screen when it is not the stored one (a Market link naming a hub); pressed instead. */
  shownHubId?: TradeHub['id'];
  /** After a hub pick (or a scope switch) is written, with the hub now in use: for a page that also points its URL at it. */
  onPicked?: (hubId: TradeHub['id'], kind: HubPickKind) => void;
  triggerClassName?: string;
  triggerId?: string;
  /** The trigger's accessible name; it starts with the visible hub (WCAG 2.5.3). */
  triggerLabel: string;
  /** The trigger's visible content, usually the hub's name. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { hubId, choice, scope } = useHubFor(area);
  // A hub on screen other than the stored one (a link's) is pressed; the stored one presses what it is set to.
  const pressed = shownHubId !== undefined && shownHubId !== hubId ? shownHubId : choice;

  function pick(next: HubChoice) {
    setOpen(false);
    if (next === CLOSEST) {
      // Report the hub Closest finds, once it is written and worked out.
      void pickHubFor(area, CLOSEST)
        .then(() => loadHubFor(area))
        .then((hub) => onPicked?.(hub, 'hub'));
      return;
    }
    void pickHubFor(area, next);
    onPicked?.(next, 'hub');
  }

  const chip = (selected: boolean) =>
    cx(
      'inline-flex w-full items-center justify-center rounded-xs border px-2 text-sm whitespace-nowrap',
      interactiveClassName,
      focusRingClassName,
      controlHeightClassName.sm,
      toggleChipStateClassName(selected)
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger id={triggerId} className={triggerClassName} aria-label={triggerLabel}>
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={triggerLabel} className="w-72 space-y-3 p-3">
        <section className="space-y-1.5">
          {/* The group carries the name; the heading is what shows. */}
          <p aria-hidden="true" className={eyebrowClassName}>
            {t('pageHubs.settingsLabel')}
          </p>
          <SegmentedControl<HubScope>
            label={t('pageHubs.settingsLabel')}
            size="sm"
            fill
            uppercase={false}
            value={scope}
            options={[
              { value: 'global', label: t('pageHubs.appSetting') },
              { value: 'page', label: pageHubAreaName(t, area) },
            ]}
            onChange={(next) => {
              // After the switch the page may use another hub (Global's): report it like a pick.
              void setHubScope(area, next)
                .then(() => loadHubFor(area))
                .then((hub) => onPicked?.(hub, 'scope'));
            }}
          />
        </section>
        <section className="space-y-1.5">
          <p aria-hidden="true" className={eyebrowClassName}>
            {t('pageHubs.hubLabel')}
          </p>
          <div
            role="group"
            aria-label={t('pageHubs.hubLabel')}
            className="grid grid-cols-2 gap-1.5"
          >
            <button
              type="button"
              aria-pressed={pressed === CLOSEST}
              className={cx(chip(pressed === CLOSEST), 'col-span-2')}
              onClick={() => pick(CLOSEST)}
            >
              {t('pageHubs.closest')}
            </button>
            {TRADE_HUBS.map((hub) => (
              <button
                key={hub.id}
                type="button"
                aria-pressed={pressed === hub.id}
                className={chip(pressed === hub.id)}
                onClick={() => pick(hub.id)}
              >
                {hub.stationLabel}
              </button>
            ))}
          </div>
        </section>
        {side !== undefined && hasPercentField(area) && <PercentRow area={area} side={side} />}
      </PopoverContent>
    </Popover>
  );
}

/** Writes a typed percent once, if it reads as one. */
function commitPending(area: PageHubArea, pending: { current: string | null }) {
  const raw = pending.current;
  pending.current = null;
  if (raw === null || raw.trim() === '') return;
  const value = Number(raw);
  if (isValidPricePercent(value)) void setPricePercentFor(area, value);
}

/**
 * The page's percent: a number box written when the pilot is done with it
 * (Enter, leaving the box, or the popover closing), not on every keystroke,
 * which would re-price the page at each partial value ("8" on the way to 85).
 * An unreadable value is left unwritten.
 */
function PercentRow({ area, side }: { area: PageHubArea; side: PriceSide }) {
  const { t } = useTranslation();
  const id = useId();
  const percent = usePricePercentFor(area);
  const [text, setText] = useState(String(percent));
  const [seen, setSeen] = useState(percent);
  // Follow a change made elsewhere (another device), unless the box already reads it.
  if (seen !== percent) {
    setSeen(percent);
    if (Number(text) !== percent) setText(String(percent));
  }
  const pending = useRef<string | null>(null);
  const commit = () => commitPending(area, pending);
  // The popover closing unmounts the box, often without a blur: write what was typed.
  useEffect(() => () => commitPending(area, pending), [area]);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
      <label htmlFor={id} className="text-sm">
        {side === 'buy' ? t('pageHubs.buyPercent') : t('pageHubs.sellPercent')}
      </label>
      <div className="flex items-center gap-1.5">
        <TextInput
          id={id}
          size="sm"
          type="number"
          inputMode="decimal"
          min={0}
          max={1000}
          className="w-20 text-right"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            pending.current = event.target.value;
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
        <span aria-hidden="true" className="text-sm text-text-dim">
          %
        </span>
      </div>
    </div>
  );
}

/**
 * `HubMenu` standing alone as a control: field chrome with the hub's name (and
 * the page's percent when not 100) and the chevron (DESIGN.md §6c, `CaretDown`
 * inside field chrome), where a page used to have a hub `Select`.
 */
export function HubField({
  area,
  side,
  label,
  size = 'md',
  className,
  shownHubId,
  onPicked,
  id,
}: {
  area: PageHubArea;
  /** The side the page prices on; without it there is no percent. */
  side?: PriceSide;
  shownHubId?: TradeHub['id'];
  onPicked?: (hubId: TradeHub['id'], kind: HubPickKind) => void;
  /** For a `Field`'s `htmlFor`. */
  id?: string;
  /** What the field picks ("Priced at"); the trigger is named "<hub>, <label>" so it starts with what shows. */
  label: string;
  size?: ControlSize;
  className?: string;
}) {
  const { t } = useTranslation();
  const { hubId, closestFound } = useHubFor(area);
  const percent = usePricePercentFor(area);
  const hub = getTradeHub(shownHubId ?? hubId) ?? DEFAULT_TRADE_HUB;
  const hubText =
    closestFound && (shownHubId === undefined || shownHubId === hubId)
      ? t('pageHubs.closestFound', { hub: hub.systemName })
      : hub.systemName;
  const shown =
    side !== undefined && hasPercentField(area) ? withPercent(t, hubText, percent) : hubText;
  return (
    <HubMenu
      area={area}
      side={side}
      shownHubId={shownHubId}
      onPicked={onPicked}
      triggerId={id}
      triggerClassName={cx(selectTriggerClassName(size), className)}
      triggerLabel={t('pageHubs.fieldLabel', { hub: shown, label })}
    >
      <span>{shown}</span>
      <SelectChevron size={size} />
    </HubMenu>
  );
}
