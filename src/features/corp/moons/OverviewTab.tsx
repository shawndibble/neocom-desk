import { useTranslation } from 'react-i18next';
import { Panel, StatChip, StatChips } from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { POPS_WINDOW_DAYS } from '@/engine/corpTaxBook/bookSections';
import type { ScheduleRow } from '@/engine/corpTaxBook/readModels';
import { formatCountdown } from '@/lib/duration';
import { useBook } from './useBook';
import { useTabsProjection } from './useTabsProjection';
import { NeedsYouQueue } from './NeedsYouQueue';
import { isk, shortDate } from './moonsFormat';
import { extractionPath } from './moonsPaths';
import { PlaceCell } from './sectionParts';

/**
 * The book at a glance: the totals, what needs an officer, and the moons that can be
 * mined now or soon. Fractured first (mineable, field going), then Ready (mineable now), then
 * Extracting moons whose chunk arrives within a week. Every Extraction, a month long at most,
 * stays on the Extractions tab.
 */
export function OverviewTab({ showMoons }: { showMoons: boolean }) {
  const { t } = useTranslation();
  const { view, names } = useBook();
  const { totals, billableThrough, donationsBeforeBook, schedule } = useTabsProjection();
  const now = Date.parse(view.input.now);
  const until = (iso: string) => formatCountdown(Math.max(0, Date.parse(iso) - now) / 1000);
  const groups: {
    id: string;
    title: string;
    rows: ScheduleRow[];
    when: (r: ScheduleRow) => string;
  }[] = [
    {
      id: 'fractured',
      title: t('corpTaxBook.moons.overview.fractured'),
      rows: schedule.fractured,
      when: (r) =>
        r.expiresAt
          ? t('corpTaxBook.moons.overview.fieldGoneIn', { in: until(r.expiresAt) })
          : t('corpTaxBook.moons.overview.fieldGoneUnknown'),
    },
    {
      id: 'ready',
      title: t('corpTaxBook.moons.overview.ready'),
      rows: schedule.ready,
      when: (r) =>
        t('corpTaxBook.moons.overview.readySince', { date: shortDate(r.chunkArrivalAt) }),
    },
    {
      id: 'pops',
      title: t('corpTaxBook.moons.overview.pops', { count: POPS_WINDOW_DAYS }),
      rows: schedule.pops,
      when: (r) => t('corpTaxBook.moons.overview.popsIn', { in: until(r.chunkArrivalAt) }),
    },
  ];
  return (
    <div className="space-y-4">
      <StatChips>
        <StatChip label={t('corpTaxBook.moons.chips.owed')} value={isk(totals.owed)} emphasis />
        <StatChip
          label={t('corpTaxBook.moons.chips.overdue')}
          value={t('corpTaxBook.moons.chips.overdueValue', {
            amount: isk(totals.overdue),
            count: totals.overdueCount,
          })}
          {...(totals.overdue > 0 ? { tone: 'danger' as const } : {})}
        />
        <StatChip label={t('corpTaxBook.moons.chips.unbilled')} value={isk(totals.unbilled)} />
        <StatChip label={t('corpTaxBook.moons.chips.credit')} value={isk(totals.credit)} />
        <StatChip
          label={t('corpTaxBook.moons.overview.billableThrough')}
          value={billableThrough ? shortDate(billableThrough) : '—'}
          tooltip={t('corpTaxBook.moons.health.billableHint', { hours: view.input.graceHours })}
          tooltipGlyph="info"
        />
      </StatChips>
      {donationsBeforeBook > 0 && (
        <p className="text-xs text-text-dim">
          {t('corpTaxBook.moons.beforeBook.donations', { count: donationsBeforeBook })}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <NeedsYouQueue />
        {showMoons && (
          <Panel title={t('corpTaxBook.moons.overview.schedule')} padded={false}>
            {groups.map((g) => (
              <section key={g.id} aria-label={g.title}>
                <h3 className={`${eyebrowClassName} border-b border-line bg-panel-2 px-3 py-1.5`}>
                  {g.title} · {g.rows.length}
                </h3>
                {g.rows.length === 0 ? (
                  <p className="border-b border-line px-3 py-2 text-xs text-text-dim last:border-b-0">
                    {t('corpTaxBook.moons.overview.none')}
                  </p>
                ) : (
                  <ul className="divide-y divide-line border-b border-line last:border-b-0">
                    {g.rows.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                        <span className="min-w-0 flex-1">
                          <PlaceCell
                            refinery={names.refinery(r.structureId)}
                            moon={names.moon(r.moonId)}
                            to={extractionPath(r.id)}
                          />
                        </span>
                        <span className="text-right text-xs tabular-nums">
                          <span className="block">{g.when(r)}</span>
                          <span className="block text-text-dim">
                            {r.estimatedValue
                              ? isk(r.estimatedValue)
                              : t('corpTaxBook.moons.oreUnknown')}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}
