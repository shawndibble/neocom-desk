/**
 * The Mining Yield Overview's page settings (issues #1278, #1279, #1280):
 * the date range, and the price basis and buyback rate inside a "Value"
 * menu. On a wide desktop the range and chart metric sit in the header and
 * the value settings in a popover; narrower, everything but the range moves
 * into one sheet behind a header gear, and narrower still the range joins
 * them (`OverviewTab`'s header).
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextInput,
  Checkbox,
  Radio,
  SegmentedControl,
} from '@/components/ui';
import {
  fieldBaseClassName,
  fieldSizeClassName,
  focusRingClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { MINING_YIELD_RANGES, type MiningYieldRange } from '@/engine/miningTax/yieldRange';
import { basisSide, isNowBasis, type PriceBasis } from '@/engine/miningTax/priceBasis';
import { CHART_METRICS, type ChartMetric } from './chartMetricPref';
import {
  MAX_BUYBACK_RATE,
  isValidBuybackRate,
  MIN_BUYBACK_RATE,
} from '@/engine/miningTax/buybackRate';
import { valueButtonLabel } from './basisLabel';

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
    <SegmentedControl
      label={t('miningTax.overview.dateRangeStat')}
      options={MINING_YIELD_RANGES.map((range) => ({
        value: range,
        label: t(`miningTax.overview.range.${range}`),
      }))}
      value={value}
      onChange={onChange}
      fill={fill}
      uppercase={false}
    />
  );
}

interface ChartMetricControlProps {
  value: ChartMetric;
  onChange: (metric: ChartMetric) => void;
  /** Full width with 44px tap targets — the phone layout. */
  fill?: boolean;
}

/** Segmented ISK / m³ / Count select for the Overview's two charts (issue #2160). */
export function ChartMetricControl({ value, onChange, fill = false }: ChartMetricControlProps) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      label={t('miningTax.overview.chartMetric.title')}
      options={CHART_METRICS.map((metric) => ({
        value: metric,
        label: t(`miningTax.overview.chartMetric.${metric}Option`),
      }))}
      value={value}
      onChange={onChange}
      fill={fill}
      uppercase={false}
    />
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
      <legend className={cx(eyebrowClassName, 'mb-1.5')}>
        {t('miningTax.overview.basis.title')}
      </legend>
      {choices.map((choice) => (
        <label
          key={choice}
          className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xs border px-2.5 py-2 md:min-h-0 ${current === choice ? 'border-accent-dim bg-bg' : 'border-transparent hover:bg-panel-2'}`}
        >
          <Radio
            name="mining-price-basis"
            className="mt-0.5"
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
    // A plain labelled checkbox, the app's one on/off control (Settings uses
    // the same markup) — not a custom switch.
    <div className="space-y-1.5">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold md:min-h-0">
        <Checkbox checked={value} onChange={() => onChange(!value)} />
        {t('miningTax.overview.showRefiningLabel')}
      </label>
      <p className="text-xs text-text-dim">{t('miningTax.overview.showRefiningHint')}</p>
    </div>
  );
}

const triggerClassName = cx(
  'flex items-center gap-2 hover:border-text-dim',
  fieldBaseClassName,
  fieldSizeClassName.md,
  interactiveClassName,
  focusRingClassName
);

/** Field-chrome caret: both triggers open a list of settings to pick from (§6c). */
const triggerCaret = (
  <Icon.Expanded aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-faint" />
);

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
        <button type="button" className={triggerClassName}>
          <span className={eyebrowClassName}>{t('miningTax.overview.valueMenu')}</span>
          <span>{valueButtonLabel(t, basis, buybackRate)}</span>
          {triggerCaret}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 p-3.5">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The settings sheet: the Overview's view settings that don't fit the header
 * row, behind one icon-only gear. Its header shares a line with the
 * Character picker and never wraps, and a text trigger ("30d · Jita buy")
 * beside the range truncated the title at 1024. These are
 * view settings, not actions, so they live here, not in a ⋮.
 */
export function SettingsSheet({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const title = t('miningTax.overview.settingsTitle');
  return (
    <>
      <IconButton
        icon={<Icon.Settings />}
        label={title}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      />
      <Modal open={open} onClose={() => setOpen(false)} title={title} placement="sheet">
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
      <label className={eyebrowClassName} htmlFor="mining-overview-buyback-rate">
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
      <span className="text-xs text-text-dim">{t('miningTax.overview.buybackRateHint')}</span>
    </div>
  );
}
