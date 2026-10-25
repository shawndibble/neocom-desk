import { useTranslation } from 'react-i18next';
import { changeVerdict, STAT_DIGITS } from '@/engine/fittings/variationDelta';
import type { StatChange as StatChangeValue } from '@/engine/fittings/variationDelta';
import { createNumberFormat } from '@/lib/numberLocale';
import { formatSeconds } from '@/lib/duration';
import { cx } from '@/lib/cx';

interface StatChangeProps {
  change: StatChangeValue;
  /** Layout and type only. The tones are the primitive's. */
  className?: string;
  /**
   * Values only, for a row that already names the stat (the stats column).
   * The screen-reader name still carries it.
   */
  bare?: boolean;
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
type Verdict = keyof typeof TONE;

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
/** A change's printed parts: the stat's name around the value (`lead` … `trail`), the two values, the verdict and the spoken name. */
function useStatChangeParts(change: StatChangeValue) {
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
  return { lead, trail, before, after, verdict, spokenName: `${named(spoken)}${verdictWord}` };
}

function Values({ before, after, verdict }: { before: string; after: string; verdict: Verdict }) {
  return (
    <>
      <span className="text-text-dim">{before}</span>
      <span className={TONE[verdict]} data-verdict={verdict}>
        {' → '}
        {after}
      </span>
    </>
  );
}

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
export function StatChange({ change, className, bare = false }: StatChangeProps) {
  const { lead, trail, before, after, verdict, spokenName } = useStatChangeParts(change);
  return (
    <span className={className}>
      <span className="sr-only">{spokenName}</span>
      <span aria-hidden="true">
        {!bare && lead}
        <Values before={before} after={after} verdict={verdict} />
        {!bare && trail}
      </span>
    </span>
  );
}

function StatChangeRow({ change }: { change: StatChangeValue }) {
  const { lead, trail, before, after, verdict, spokenName } = useStatChangeParts(change);
  return (
    <span role="listitem" className="contents">
      <span className="sr-only">{spokenName}</span>
      <span aria-hidden="true" className="min-w-0">
        {lead.trim()}
      </span>
      <span aria-hidden="true" className="min-w-0 tabular-nums">
        <Values before={before} after={after} verdict={verdict} />
        {trail}
      </span>
    </span>
  );
}

/**
 * Several fit stats changing, one per row: the stat's name in one column, its
 * `before → after` and unit in the next, so a long list reads down instead of
 * running on as a sentence. Tones and spoken names as `StatChange`.
 *
 * @summary Fit stat changes as a two-column list.
 */
export function StatChangeList({
  changes,
  className,
}: {
  changes: readonly StatChangeValue[];
  /** Layout and type only. */
  className?: string;
}) {
  return (
    <span role="list" className={cx('grid grid-cols-[auto_minmax(0,1fr)] gap-x-3', className)}>
      {changes.map((change) => (
        <StatChangeRow key={change.key} change={change} />
      ))}
    </span>
  );
}
