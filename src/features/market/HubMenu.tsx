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

export type HubPickKind = 'hub' | 'scope';

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
  side?: PriceSide;
  shownHubId?: TradeHub['id'];
  onPicked?: (hubId: TradeHub['id'], kind: HubPickKind) => void;
  triggerClassName?: string;
  triggerId?: string;
  triggerLabel: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { hubId, choice, scope } = useHubFor(area);
  const pressed = shownHubId !== undefined && shownHubId !== hubId ? shownHubId : choice;

  function pick(next: HubChoice) {
    setOpen(false);
    if (next === CLOSEST) {
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

function commitPending(area: PageHubArea, pending: { current: string | null }) {
  const raw = pending.current;
  pending.current = null;
  if (raw === null || raw.trim() === '') return;
  const value = Number(raw);
  if (isValidPricePercent(value)) void setPricePercentFor(area, value);
}

function PercentRow({ area, side }: { area: PageHubArea; side: PriceSide }) {
  const { t } = useTranslation();
  const id = useId();
  const percent = usePricePercentFor(area);
  const [text, setText] = useState(String(percent));
  const [seen, setSeen] = useState(percent);
  if (seen !== percent) {
    setSeen(percent);
    if (Number(text) !== percent) setText(String(percent));
  }
  const pending = useRef<string | null>(null);
  const commit = () => commitPending(area, pending);
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
  side?: PriceSide;
  shownHubId?: TradeHub['id'];
  onPicked?: (hubId: TradeHub['id'], kind: HubPickKind) => void;
  id?: string;
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
