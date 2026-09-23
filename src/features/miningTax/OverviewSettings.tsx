/**
 * The Mining Yield Overview's page settings (issues #1278, #1279): the date
 * range, and the price basis inside a "Value" menu. On desktop the range sits
 * in the header and the basis in a popover; on a phone both live in one
 * bottom sheet behind a single header button.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { MINING_YIELD_RANGES, type MiningYieldRange } from '@/engine/miningTax/yieldRange';
import { basisSide, isNowBasis, type PriceBasis } from '@/engine/miningTax/priceBasis';
import { basisLabel } from './basisLabel';

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

const triggerClassName =
  'flex items-center gap-2 rounded-xs border border-accent-dim bg-panel-2 px-2.5 text-xs text-text hover:border-line-bright focus-visible:outline-2 focus-visible:outline-accent';

/** Desktop: the header's "VALUE  Jita buy" button and its popover. */
export function ValueMenu({ children, basis }: { children: ReactNode; basis: PriceBasis }) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={`${triggerClassName} h-8`}>
          <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.overview.valueMenu')}
          </span>
          <span>{basisLabel(t, basis)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 p-3.5">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Phone: one header button ("30d · Jita buy") opening every page setting in a bottom sheet. */
export function MobileSettings({
  range,
  basis,
  children,
}: {
  range: MiningYieldRange;
  basis: PriceBasis;
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
        {t(`miningTax.overview.range.${range}`)} · {basisLabel(t, basis)}
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
