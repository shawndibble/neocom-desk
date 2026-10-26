import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { InfoTooltip, ProgressBar } from '@/components/ui';
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

export function OverdueWord({ days, paused }: { days: number | null; paused?: boolean }) {
  const { t } = useTranslation();
  if (days === null && paused)
    return <span className="text-warning">{t('corpTaxBook.moons.overduePaused')}</span>;
  if (days === null) return <span className="text-text-dim">—</span>;
  return (
    <span className="font-semibold whitespace-nowrap text-danger">
      {t('corpTaxBook.moons.overdueDays', { count: days })}
    </span>
  );
}

/** Ore make-up of a chunk, or D13's fallback. `onLink` adds the "Link a Survey" action to the unknown case. */
export function OreLine({
  row,
  onLink,
}: {
  row: Pick<ExtractionRow, 'oreLines'>;
  onLink?: () => void;
}) {
  const { t } = useTranslation();
  const { names } = useBook();
  if (row.oreLines.length === 0)
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1 text-warning">
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {t('corpTaxBook.moons.oreUnknown')}
          <InfoTooltip
            label={t('corpTaxBook.moons.oreUnknownLabel')}
            content={t('corpTaxBook.moons.oreUnknownWhy')}
            glyph="info"
          />
        </span>
        {onLink && (
          <button type="button" className={entityLinkClassName()} onClick={onLink}>
            {t('corpTaxBook.moons.moon.link.open')}
          </button>
        )}
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
