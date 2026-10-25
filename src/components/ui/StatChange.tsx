import { useTranslation } from 'react-i18next';
import { changeVerdict, STAT_DIGITS } from '@/engine/fittings/variationDelta';
import type { StatChange as StatChangeValue } from '@/engine/fittings/variationDelta';
import { createNumberFormat } from '@/lib/numberLocale';
import { formatSeconds } from '@/lib/duration';

interface StatChangeProps {
  change: StatChangeValue;
  /** Layout and type only. The tones are the primitive's. */
  className?: string;
}

const formatters = new Map<number, (value: number) => string>();
function formatAt(digits: number, value: number): string {
  let format = formatters.get(digits);
  if (!format) {
    format = createNumberFormat({ maximumFractionDigits: digits });
    formatters.set(digits, format);
  }
  return format(value);
}

const VALUE = '\u0000';

const TONE = { better: 'text-success', worse: 'text-danger', neutral: 'text-text' } as const;

/**
 * One fit stat changing: the stat's name, then `before → after`. The before
 * value is dim; the arrow and the after value are `success` when the change is
 * better, `danger` when worse and plain when the stat is neutral (it only
 * moves with the hull). Colour is never the only cue: both numbers are printed,
 * and the screen-reader name adds "better" or "worse". Rounds at the stats
 * panel's `STAT_DIGITS`. Money is not a stat: ISK keeps `IskDelta`.
 *
 * @summary A fit stat's before → after, green when better, red when worse.
 */
export function StatChange({ change, className }: StatChangeProps) {
  const { t } = useTranslation();
  const verdict = changeVerdict(change);
  const isCapacitor = change.key === 'capacitor';
  const digits = STAT_DIGITS[change.key];
  // Capacitor values are stable % (positive) or a negated depletion time.
  const show = (value: number) =>
    isCapacitor
      ? value >= 0
        ? t('fittings.statChange.stable', { pct: formatAt(0, value) })
        : t('fittings.statChange.depletes', { time: formatSeconds(-value) })
      : formatAt(digits, value);
  const before = show(change.before);
  const after = show(change.after);
  const named = (value: string) =>
    isCapacitor
      ? t('fittings.statChange.capacitor', { value })
      : t(`fittings.variations.stat.${change.key}`, { value });
  const [lead = '', trail = ''] = named(VALUE).split(VALUE);
  const spoken = t('fittings.statChange.spoken', { before, after });
  const verdictWord = verdict === 'neutral' ? '' : `, ${t(`fittings.statChange.${verdict}`)}`;
  return (
    <span className={className}>
      <span className="sr-only">{`${named(spoken)}${verdictWord}`}</span>
      <span aria-hidden="true">
        {lead}
        <span className="text-text-dim">{before}</span>
        <span className={TONE[verdict]} data-verdict={verdict}>
          {' → '}
          {after}
        </span>
        {trail}
      </span>
    </span>
  );
}
