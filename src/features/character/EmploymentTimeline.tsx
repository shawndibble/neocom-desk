/**
 * The career timeline shared by the Employment History page and the Public
 * Info modal's Employment tab: headline figures, then one card per corporation
 * stint down a rail. Presentational only: `employmentHistory.ts` derives every
 * figure and flag, so nothing here recomputes them.
 *
 * Each stint's date range shows once. On the page at `md` and up it sits in the
 * gutter beside the rail; everywhere else (a phone, and always in the modal,
 * which is too narrow for a gutter) it sits under the name.
 *
 * An NPC corporation stint (idle time, or a stop between player corps) draws
 * as a slim dimmed line instead of a card: an NPC tag in place of the stint
 * pills, and no logo or bar.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StatChip, StatChips } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { CorporationLink } from '@/features/entities/EntityLink';
import { cx } from '@/lib/cx';
import { formatTenure } from '@/lib/duration';
import { corporationLogoUrl } from '@/lib/eveImages';
import type { EmploymentHistoryRow, EmploymentSummary } from './employmentHistory';
import { monthYear } from './publicInfoStyles';

/** A bar never shrinks below this, so a two-day stint still shows a sliver. */
const MIN_BAR_PERCENT = 2;

/**
 * The stint's name and tags, then its date range under them wherever the page's
 * gutter doesn't carry it. Shared by the card and the slim NPC line.
 */
function StintHeading({
  row,
  name,
  current,
  range,
  page,
  children,
}: {
  row: EmploymentHistoryRow;
  name: string;
  current: boolean;
  range: string;
  page: boolean;
  /** Tags after CURRENT: the card's stint pills, or the NPC line's NPC tag. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CorporationLink id={row.corporationId} className="min-w-0 truncate text-left">
          {name}
        </CorporationLink>
        {current && (
          <Pill tone="success" className="leading-4">
            {t('employmentHistory.current')}
          </Pill>
        )}
        {children}
      </div>
      <div className={cx('text-xs text-text-dim', page && 'md:hidden')}>{range}</div>
    </div>
  );
}

export function EmploymentSummaryChips({
  summary,
  names,
}: {
  summary: EmploymentSummary;
  names: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
  const { longest } = summary;
  return (
    <StatChips>
      <StatChip
        label={t('employmentHistory.summary.timeInGame')}
        value={formatTenure(summary.timeInGameSeconds)}
      />
      <StatChip
        label={t('employmentHistory.summary.corporations')}
        value={summary.corporationCount}
      />
      <StatChip
        label={t('employmentHistory.summary.currentTenure')}
        value={formatTenure(summary.currentTenureSeconds)}
      />
      {longest && (
        <StatChip
          label={t('employmentHistory.summary.longest')}
          value={
            <>
              {formatTenure(longest.seconds)}{' '}
              <span className="font-normal text-text-dim">
                {names.get(longest.corporationId) ?? `#${longest.corporationId}`}
              </span>
            </>
          }
        />
      )}
    </StatChips>
  );
}

interface EmploymentTimelineProps {
  /** Most-recent first, as `deriveEmploymentHistoryRows` returns them. */
  rows: readonly EmploymentHistoryRow[];
  names: ReadonlyMap<number, string>;
  label: string;
  /**
   * The corporation the page's CURRENT chip must match: the character's own,
   * so an ongoing row the character record hasn't caught up to (or has no
   * corporation yet) stays plain. The modal has no character record and
   * ignores it, so its ongoing row is always CURRENT.
   */
  currentCorporationId?: number;
  /** `modal` never draws the date gutter. */
  variant?: 'page' | 'modal';
}

export function EmploymentTimeline({
  rows,
  names,
  label,
  currentCorporationId,
  variant = 'page',
}: EmploymentTimelineProps) {
  const { t } = useTranslation();
  const page = variant === 'page';
  return (
    <ol aria-label={label}>
      {rows.map((row, i) => {
        const name = names.get(row.corporationId) ?? `#${row.corporationId}`;
        const current = row.ongoing && (!page || currentCorporationId === row.corporationId);
        const end = row.ongoing ? t('employmentHistory.present') : monthYear(rows[i - 1].startDate);
        const range = `${monthYear(row.startDate)} – ${end}`;
        const isFirst = i === 0;
        const isLast = i === rows.length - 1;
        return (
          <li
            key={row.recordId}
            className={cx(
              'grid gap-x-3 grid-cols-[1rem_minmax(0,1fr)]',
              page && 'md:grid-cols-[5.5rem_1rem_minmax(0,1fr)]'
            )}
          >
            {page && (
              <div className="hidden pt-2.5 text-right text-xs text-text-dim md:block">
                <span className="block font-semibold text-text">{monthYear(row.startDate)}</span>
                {row.ongoing
                  ? t('employmentHistory.now')
                  : t('employmentHistory.until', { date: end })}
              </div>
            )}
            <div aria-hidden className="relative">
              <span
                className={cx(
                  'absolute left-1/2 w-0.5 -translate-x-1/2 bg-line',
                  isFirst ? 'top-4' : 'top-0',
                  isLast ? 'bottom-[calc(100%-1rem)]' : 'bottom-0'
                )}
              />
              <span
                className={cx(
                  'absolute top-3 left-1/2 size-3 -translate-x-1/2 rounded-full border-2',
                  current
                    ? 'border-success bg-success ring-4 ring-success/20'
                    : 'border-line-bright bg-panel'
                )}
              />
            </div>
            {row.npc ? (
              <div className="mb-2.5 min-w-0 px-3 py-2 text-sm text-text-dim">
                <div className="flex items-center gap-3">
                  <StintHeading row={row} name={name} current={current} range={range} page={page}>
                    <Pill className="leading-4">{t('employmentHistory.npc')}</Pill>
                  </StintHeading>
                  <span className="shrink-0 tabular-nums">{formatTenure(row.tenureSeconds)}</span>
                </div>
              </div>
            ) : (
              <div className="mb-2.5 min-w-0 rounded-xs bg-panel-2 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <img
                    src={corporationLogoUrl(row.corporationId, 64)}
                    crossOrigin="anonymous"
                    alt=""
                    width={32}
                    height={32}
                    loading="lazy"
                    className="size-8 max-w-none shrink-0 rounded-xs border border-line"
                  />
                  <StintHeading row={row} name={name} current={current} range={range} page={page}>
                    {row.returned && (
                      <Pill className="leading-4">{t('employmentHistory.returned')}</Pill>
                    )}
                    {row.shortStay && (
                      <Pill tone="warning" className="leading-4">
                        {t('employmentHistory.shortStay')}
                      </Pill>
                    )}
                  </StintHeading>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatTenure(row.tenureSeconds)}
                  </span>
                </div>
                <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-xs bg-line">
                  <div
                    data-tenure-bar
                    className="h-full rounded-xs bg-line-bright"
                    style={{
                      width: `${Math.max(MIN_BAR_PERCENT, Math.round(row.tenureRatio * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
