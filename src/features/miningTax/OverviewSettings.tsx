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
import { useIsPhone } from '@/lib/useIsPhone';
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
  fill?: boolean;
}

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
  fill?: boolean;
}

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
          className={`flex min-h-9 cursor-pointer items-start gap-2.5 rounded-xs border px-2.5 py-2 md:min-h-0 ${current === choice ? 'border-accent-dim bg-bg' : 'border-transparent hover:bg-panel-2'}`}
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

export function ShowRefiningToggle({ value, onChange }: ShowRefiningToggleProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-semibold md:min-h-0">
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

const triggerCaret = (
  <Icon.Expanded aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-faint" />
);

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
      <PopoverContent
        align="end"
        aria-label={t('miningTax.overview.valueMenu')}
        className="w-80 space-y-4 p-3.5"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function SettingsSheet({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
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
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        placement={isPhone ? 'sheet' : 'center'}
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
