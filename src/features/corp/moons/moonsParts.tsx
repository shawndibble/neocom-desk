import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTimeZone } from '@/lib/timeFormat';
import { useTranslation } from 'react-i18next';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { InfoTooltip, ProgressBar } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { ExtractionRow, MinerStanding } from '@/engine/corpTaxBook/bookView';
import type { ExtractionState } from '@/engine/corpTaxBook/extraction';
import { DAY_MS } from '@/lib/age';
import { cx } from '@/lib/cx';
import { atDate } from './moonsFormat';
import { useBook } from './useBook';
import { tapTargetClassName } from './sectionHelpers';

const STATE_TONE: Record<ExtractionState, string> = {
  extracting: 'text-text-dim',
  ready: 'text-success',
  fractured: 'text-warning',
  expired: 'text-text-dim',
  cancelled: 'text-text-dim',
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
  const navigate = useNavigate();
  // Arrived by an in-app click (a router key, not the first load): Back is the page it came from,
  // whichever that was, so it reads "Back". Modified clicks and a first load keep the link's own
  // destination and label.
  const cameFromApp = useLocation().key !== 'default';
  const { t } = useTranslation();
  return (
    <Link
      to={to}
      onClick={(e) => {
        if (!cameFromApp || e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(-1);
      }}
      className={cx(inlineLinkClassName, 'gap-1 text-xs', tapTargetClassName)}
    >
      <Icon.Back size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      {cameFromApp ? t('corpTaxBook.moons.setup.back') : label}
    </Link>
  );
}

/**
 * A Statement's due date; once past, the days late, in danger. `now` is the book's clock.
 * While a declaration pauses the Overdue clock (`pausedUntil`), no due date or lateness shows.
 */
export function DueWord({
  dueAt,
  now,
  pausedUntil,
}: {
  dueAt: string | null;
  now: string;
  pausedUntil?: string | null;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  if (pausedUntil) {
    return (
      <span className="whitespace-nowrap text-text-dim">
        {t('corpTaxBook.moons.statementPeriod.pausedUntil', { date: atDate(pausedUntil, zone) })}
      </span>
    );
  }
  if (dueAt === null) return <span className="text-text-dim">—</span>;
  const elapsed = Date.parse(now) - Date.parse(dueAt);
  if (elapsed < 0) return <span className="whitespace-nowrap">{atDate(dueAt, zone)}</span>;
  const late = Math.max(1, Math.floor(elapsed / DAY_MS));
  return (
    <span className="font-semibold whitespace-nowrap text-danger">
      {t('corpTaxBook.moons.statementPeriod.dueLate', { date: atDate(dueAt, zone), count: late })}
    </span>
  );
}
