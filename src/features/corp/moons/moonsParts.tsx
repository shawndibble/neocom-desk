import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { ProgressBar } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { ExtractionRow, MinerStanding } from '@/engine/corpTaxBook/bookView';
import type { ExtractionState } from '@/engine/corpTaxBook/extraction';
import { cx } from '@/lib/cx';
import { useBook } from './useBook';

const STATE_TONE: Record<ExtractionState, string> = {
  extracting: 'text-text-dim',
  ready: 'text-success',
  fractured: 'text-warning',
  expired: 'text-text-faint',
  cancelled: 'text-text-faint',
};

/** An Extraction's state as a word (D14): readable without its colour. */
export function StateWord({ state }: { state: ExtractionState }) {
  const { t } = useTranslation();
  return (
    <span
      className={cx(
        'text-[0.6875rem] font-semibold tracking-wider whitespace-nowrap uppercase',
        STATE_TONE[state]
      )}
    >
      {t(`corpTaxBook.moons.state.${state}`)}
    </span>
  );
}

export function StandingWord({ standing }: { standing: MinerStanding }) {
  const { t } = useTranslation();
  return (
    <span
      className={cx(
        'text-xs whitespace-nowrap',
        standing === 'left' ? 'text-warning' : 'text-text-dim'
      )}
    >
      {t(`corpTaxBook.moons.standing.${standing}`)}
    </span>
  );
}

export function OverdueWord({ days }: { days: number | null }) {
  const { t } = useTranslation();
  if (days === null) return <span className="text-text-dim">—</span>;
  return (
    <span className="font-semibold whitespace-nowrap text-danger">
      {t('corpTaxBook.moons.overdueDays', { count: days })}
    </span>
  );
}

/** Ore make-up of a chunk, or D13's fallback. */
export function OreLine({ row }: { row: Pick<ExtractionRow, 'oreLines'> }) {
  const { t } = useTranslation();
  const { names } = useBook();
  if (row.oreLines.length === 0)
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        {t('corpTaxBook.moons.oreUnknown')}
      </span>
    );
  const total = row.oreLines.reduce((s, l) => s + l.quantity, 0);
  return (
    <span>
      {row.oreLines
        .map((l) => `${names.ore(l.typeId)} ${Math.round((l.quantity / total) * 100)}%`)
        .join(' · ')}
    </span>
  );
}

/** D13: mined vs left after fracture. */
export function MinedBar({ pct, label }: { pct: number | null; label: string }) {
  const { t } = useTranslation();
  if (pct === null) return <span className="text-text-dim">—</span>;
  return (
    <span className="block min-w-28">
      <span className="text-xs tabular-nums">
        {t('corpTaxBook.moons.minedVsLeft', { mined: pct, left: 100 - pct })}
      </span>
      <ProgressBar label={label} value={pct} max={100} size="xs" className="mt-1" />
    </span>
  );
}

/** A labelled way up from a drill-down page (§6c: never a bare CaretLeft). */
export function Crumb({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className={cx(inlineLinkClassName, 'inline-flex items-center gap-1 text-xs')}>
      <Icon.Back size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      {label}
    </Link>
  );
}

export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
