import { useTranslation } from 'react-i18next';
import { changeVerdict, FLAG_STATS, STAT_DIGITS } from '@/engine/fittings/variationDelta';
import type { StatChange as StatChangeValue } from '@/engine/fittings/variationDelta';
import { createNumberFormat } from '@/lib/numberLocale';
import { formatSeconds } from '@/lib/duration';
import { cx } from '@/lib/cx';
import { flagWord } from '@/features/fittings/flagWord';

interface StatChangeProps {
  change: StatChangeValue;
  className?: string;
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

function useStatChangeParts(change: StatChangeValue) {
  const { t } = useTranslation();
  const verdict = changeVerdict(change);
  const isCapacitor = change.key === 'capacitor';
  const isFlag = FLAG_STATS.has(change.key);
  const digits = STAT_DIGITS[change.key];
  const show = (value: number) =>
    isCapacitor
      ? value >= 0
        ? t('fittings.statChange.stable', { pct: formatAt(0, value) })
        : t('fittings.statChange.depletes', { time: formatSeconds(-value) })
      : isFlag
        ? flagWord(value, t)
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

function StatChangeRow({ change, last }: { change: StatChangeValue; last: boolean }) {
  const { lead, trail, before, after, verdict, spokenName } = useStatChangeParts(change);
  return (
    <span role="listitem" className="col-span-2 grid grid-cols-subgrid">
      <span className="sr-only">{last ? spokenName : `${spokenName};`}</span>
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
 * @summary Fit stat changes as a two-column list.
 */
export function StatChangeList({
  changes,
  className,
}: {
  changes: readonly StatChangeValue[];
  className?: string;
}) {
  return (
    <span role="list" className={cx('grid grid-cols-[auto_minmax(0,1fr)] gap-x-3', className)}>
      {changes.map((change, i) => (
        <StatChangeRow key={change.key} change={change} last={i === changes.length - 1} />
      ))}
    </span>
  );
}
