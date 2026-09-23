/**
 * The Mining Yield Overview's page settings (issues #1278, #1279, #1280):
 * the date range, and the price basis and buyback rate inside a "Value"
 * menu. On desktop the range sits in the header and the rest in a popover;
 * on a phone all three live in one bottom sheet behind a single header
 * button.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import { MINING_YIELD_RANGES, type MiningYieldRange } from '@/engine/miningTax/yieldRange';
import { basisSide, isNowBasis, type PriceBasis } from '@/engine/miningTax/priceBasis';
import {
  MAX_BUYBACK_RATE,
  isValidBuybackRate,
  MIN_BUYBACK_RATE,
} from '@/engine/miningTax/buybackRate';
import { valueButtonLabel } from './basisLabel';
import type { OverviewColumnId } from './overviewColumns';
import type { MiningYieldRow } from './yieldSnapshot';

interface RangeControlProps {
  value: MiningYieldRange;
  onChange: (range: MiningYieldRange) => void;
  /** Full width with 44px tap targets — the phone layout. */
  fill?: boolean;
}

/** Segmented Date range buttons. Each range slices already-loaded rows, so switching never refetches. */
export function RangeControl({ value, onChange, fill = false }: RangeControlProps) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('miningTax.overview.dateRangeStat')}
      className={`flex overflow-hidden rounded-xs border border-line ${fill ? 'w-full' : ''}`}
    >
      {MINING_YIELD_RANGES.map((range) => {
        const active = range === value;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(range)}
            className={`border-r border-line px-3 text-xs last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${fill ? 'h-11 flex-1' : 'h-8'} ${active ? 'bg-panel-2 text-accent shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-text-dim hover:text-text'}`}
          >
            {t(`miningTax.overview.range.${range}`)}
          </button>
        );
      })}
    </div>
  );
}

type BasisChoice = 'buy' | 'sell' | 'now';

function choiceOf(basis: PriceBasis): BasisChoice {
  return isNowBasis(basis) ? 'now' : basisSide(basis);
}

interface PriceBasisOptionsProps {
  value: PriceBasis;
  onChange: (basis: PriceBasis) => void;
}

/**
 * Jita buy / Jita sell / Now. "Now" keeps whichever side was last picked, so
 * a pilot comparing "sell on the day" with "sell today" flips one choice.
 */
export function PriceBasisOptions({ value, onChange }: PriceBasisOptionsProps) {
  const { t } = useTranslation();
  const current = choiceOf(value);
  const pick = (choice: BasisChoice) =>
    onChange(choice === 'now' ? `now-${basisSide(value)}` : choice);
  const choices: BasisChoice[] = ['buy', 'sell', 'now'];
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('miningTax.overview.basis.title')}
      </legend>
      {choices.map((choice) => (
        <label
          key={choice}
          className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xs border px-2.5 py-2 md:min-h-0 ${current === choice ? 'border-accent-dim bg-bg' : 'border-transparent hover:bg-panel-2'}`}
        >
          <input
            type="radio"
            name="mining-price-basis"
            className="mt-0.5 accent-accent"
            checked={current === choice}
            onChange={() => pick(choice)}
          />
          <span className="text-sm">
            {t(`miningTax.overview.basis.${choice}Option`)}
            <span className="block text-[0.6875rem] text-text-dim">
              {t(`miningTax.overview.basis.${choice}Hint`)}
            </span>
          </span>
        </label>
      ))}
      <p className="pt-1 text-[0.6875rem] text-text-dim">
        {t('miningTax.overview.basis.fallbackNote')}
      </p>
    </fieldset>
  );
}

interface ShowRefiningToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

/**
 * "Show refining" switch (issue #1281): off for a pilot who never refines —
 * hides refined value everywhere on the page and in the detail modal, and
 * skips the ESI calls only refining needs (reprocessing material prices,
 * skills, implants).
 */
export function ShowRefiningToggle({ value, onChange }: ShowRefiningToggleProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2.5 px-2.5 py-2">
      <span className="text-sm">
        {t('miningTax.overview.showRefiningLabel')}
        <span className="block text-[0.6875rem] text-text-dim">
          {t('miningTax.overview.showRefiningHint')}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={t('miningTax.overview.showRefiningLabel')}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${value ? 'border-accent-dim bg-accent' : 'border-line bg-panel-2'}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 size-5 rounded-full bg-bg transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}

interface CardDetailsOptionsProps {
  available: readonly OverviewColumnId[];
  visible: readonly OverviewColumnId[];
  columnsById: Record<OverviewColumnId, DataTableColumn<MiningYieldRow>>;
  onToggle: (id: OverviewColumnId) => void;
  onReset: () => void;
}

/**
 * Phone equivalent of the desktop `ColumnPickerMenu` dropdown (issue #1282):
 * the same column choice, but as a checkbox group inside the settings sheet
 * rather than a second header control — a phone's "day card" (the table's
 * own responsive stack, `DataTable.tsx`) already renders from the same
 * `columns` array, so toggling here changes both at once.
 */
export function CardDetailsOptions({
  available,
  visible,
  columnsById,
  onToggle,
  onReset,
}: CardDetailsOptionsProps) {
  const { t } = useTranslation();
  const visibleSet = new Set(visible);
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('miningTax.overview.cardDetailsTitle')}
      </legend>
      {available.map((id) => (
        <label
          key={id}
          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xs px-2.5 py-2 hover:bg-panel-2"
        >
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={visibleSet.has(id)}
            onChange={() => onToggle(id)}
          />
          <span className="text-sm">{columnsById[id].header}</span>
        </label>
      ))}
      <Button variant="ghost" size="sm" onClick={onReset}>
        {t('miningTax.overview.resetColumnsAction')}
      </Button>
    </fieldset>
  );
}

const triggerClassName =
  'flex items-center gap-2 rounded-xs border border-accent-dim bg-panel-2 px-2.5 text-xs text-text hover:border-line-bright focus-visible:outline-2 focus-visible:outline-accent';

/** Desktop: the header's "VALUE  Jita buy" button and its popover. */
export function ValueMenu({
  children,
  basis,
  buybackRate,
}: {
  children: ReactNode;
  basis: PriceBasis;
  buybackRate: number;
}) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={`${triggerClassName} h-8`}>
          <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.overview.valueMenu')}
          </span>
          <span>{valueButtonLabel(t, basis, buybackRate)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 p-3.5">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Phone: one header button ("30d · 90% · Jita buy") opening every page setting in a bottom sheet. */
export function MobileSettings({
  range,
  basis,
  buybackRate,
  children,
}: {
  range: MiningYieldRange;
  basis: PriceBasis;
  buybackRate: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`${triggerClassName} h-11`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {t(`miningTax.overview.range.${range}`)} · {valueButtonLabel(t, basis, buybackRate)}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('miningTax.overview.settingsTitle')}
        placement="sheet"
      >
        <div className="space-y-4">{children}</div>
      </Modal>
    </>
  );
}

interface BuybackRateInputProps {
  value: number;
  onChange: (rate: number) => void;
}

/**
 * The buyback rate percent field (issue #1280): same string-buffer idiom as
 * the Appraisal tab's price-percent field (`AppraisalPanel.tsx`) — the box
 * holds whatever is typed, and the setting only writes once what's typed
 * parses to a valid rate, so clearing the field to retype a number doesn't
 * get clobbered mid-edit.
 */
export function BuybackRateInput({ value, onChange }: BuybackRateInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (Number(text) !== value) setText(String(value));
  }

  function handleChange(next: string) {
    setText(next);
    const parsed = Number(next);
    if (next.trim() !== '' && isValidBuybackRate(parsed)) onChange(parsed);
  }

  return (
    <div className="flex items-center gap-2">
      <label
        className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
        htmlFor="mining-overview-buyback-rate"
      >
        {t('miningTax.overview.buybackRateLabel')}
      </label>
      <TextInput
        id="mining-overview-buyback-rate"
        size="sm"
        type="number"
        inputMode="decimal"
        min={MIN_BUYBACK_RATE}
        max={MAX_BUYBACK_RATE}
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        className="field-no-spinner w-16 text-right"
      />
      <span className="text-xs text-text-faint">{t('miningTax.overview.buybackRateHint')}</span>
    </div>
  );
}
