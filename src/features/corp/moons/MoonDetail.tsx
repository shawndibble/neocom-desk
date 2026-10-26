import { createNumberFormat } from '@/lib/numberLocale';
import { formatCount } from '@/lib/formatCount';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  Panel,
  textActionClassName,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { minersOnMoon, splitPlace, type MinerOnMoon } from '@/engine/corpTaxBook/bookSections';
import { extractionDetail, type ExtractionRow } from '@/engine/corpTaxBook/bookView';
import { useIsPhone } from '@/lib/useIsPhone';
import { useBook } from './useBook';
import { ReasonDialog } from './BookDialogs';
import { LinkSurveyDialog } from './LinkSurveyDialog';
import { isk, shortDateTime } from './moonsFormat';
import { extractionPath as extractionLink, minerPath } from './moonsPaths';
import { Crumb, Fact, MinedBar, OreLine, StateWord } from './moonsParts';
import { OreLinesTable } from './OreLinesTable';
import { BookSection, EntityHeader } from './sectionParts';

const formatDecimal = createNumberFormat({ maximumFractionDigits: 3 });

/**
 * A moon's page: this extraction's header, then one scroll of
 * who mined it (a row opens in place to that Miner's ore lines) and earlier cycles.
 */
export function MoonDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const { view, names, edit, canEdit } = useBook();
  const phone = useIsPhone();
  const [dismissing, setDismissing] = useState(false);
  const [linking, setLinking] = useState(false);
  const detail = extractionDetail(view, id);
  const miners = useMemo(() => minersOnMoon(view, id), [view, id]);
  if (!detail) {
    return (
      <div className="space-y-4">
        <Crumb to="/corp/moons/extractions" label={t('corpTaxBook.moons.tabs.extractions')} />
        <EmptyState title={t('corpTaxBook.moons.moon.notFound')} />
      </div>
    );
  }
  const { row } = detail;
  const place = splitPlace(names.refinery(row.structureId), names.moon(row.moonId));
  const mined = miners.reduce((s, m) => s + m.value, 0);
  const left =
    row.estimatedValue !== null && row.minedPct !== null
      ? Math.round(row.estimatedValue * (1 - row.minedPct / 100))
      : null;
  const minerName = (m: MinerOnMoon) =>
    names.character(view.miners.find((x) => x.id === m.minerId)?.mainCharacterId ?? 0);
  const minerColumns: DataTableColumn<MinerOnMoon>[] = [
    {
      id: 'miner',
      header: t('corpTaxBook.moons.cols.miner'),
      primary: true,
      render: (m) => minerName(m),
      sortValue: (m) => minerName(m),
    },
    {
      id: 'units',
      header: t('corpTaxBook.moons.cols.units'),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => formatCount(m.units),
      sortValue: (m) => m.units,
    },
    {
      id: 'value',
      header: t('corpTaxBook.moons.cols.value'),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => isk(m.value),
      sortValue: (m) => m.value,
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.tax'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (m) => isk(m.tax),
      sortValue: (m) => m.tax,
    },
  ];
  const cycleColumns: DataTableColumn<ExtractionRow>[] = [
    {
      id: 'fractured',
      header: t('corpTaxBook.moons.cols.fractured'),
      render: (r) => (
        <Link to={extractionLink(r.id)} className={entityLinkClassName()}>
          {r.fracturedAt ? shortDateTime(r.fracturedAt) : shortDateTime(r.chunkArrivalAt)}
        </Link>
      ),
    },
    {
      id: 'state',
      header: t('corpTaxBook.moons.cols.state'),
      render: (r) => <StateWord state={r.state} />,
    },
    {
      id: 'est',
      header: t('corpTaxBook.moons.cols.estValue'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => (r.estimatedValue ? isk(r.estimatedValue) : '—'),
    },
    {
      id: 'mined',
      header: t('corpTaxBook.moons.cols.minedShort'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => (r.minedPct === null ? '—' : `${r.minedPct}%`),
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.taxRecorded'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (r) => isk(r.tax),
    },
    {
      id: 'miners',
      header: t('corpTaxBook.moons.cols.miners'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => r.minerCount,
    },
  ];
  return (
    <div className="space-y-4">
      <Crumb to="/corp/moons/extractions" label={t('corpTaxBook.moons.tabs.extractions')} />
      <PageHeader
        title={place.moon ?? place.station}
        meta={
          <span className="flex items-center gap-2 text-xs text-text-dim">
            <StateWord state={row.state} />
            {place.moon !== undefined && place.station}
          </span>
        }
        actions={
          canEdit ? (
            row.tax > 0 ? (
              <Button onClick={() => setDismissing(true)}>
                {t('corpTaxBook.moons.moon.dismiss')}
              </Button>
            ) : (
              <Tooltip content={t('corpTaxBook.moons.moon.dismissNone')}>
                <Button aria-disabled="true">{t('corpTaxBook.moons.moon.dismiss')}</Button>
              </Tooltip>
            )
          ) : undefined
        }
      />
      <EntityHeader
        label={t('corpTaxBook.moons.moon.taxSoFar')}
        value={isk(row.tax)}
        note={<OreLine row={row} {...(canEdit ? { onLink: () => setLinking(true) } : {})} />}
        facts={[
          {
            label: t('corpTaxBook.moons.cols.mined'),
            value: row.minedPct === null ? '—' : `${isk(mined)} · ${row.minedPct}%`,
          },
          {
            label: t('corpTaxBook.moons.moon.leftToMine'),
            value: left === null ? '—' : `${isk(left)} · ${100 - (row.minedPct ?? 0)}%`,
          },
          {
            label: t('corpTaxBook.moons.moon.fractured'),
            value: row.fracturedAt ? shortDateTime(row.fracturedAt) : '—',
          },
          {
            label: t('corpTaxBook.moons.moon.fieldGone'),
            value: row.expiresAt
              ? t('corpTaxBook.moons.moon.about', { at: shortDateTime(row.expiresAt) })
              : '—',
          },
        ]}
      />
      <Panel title={t('corpTaxBook.moons.moon.thisExtraction')}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          <Fact label={t('corpTaxBook.moons.moon.started')} value={shortDateTime(row.startedAt)} />
          <Fact
            label={t('corpTaxBook.moons.moon.arrived')}
            value={shortDateTime(row.chunkArrivalAt)}
          />
          <Fact
            label={t('corpTaxBook.moons.cols.estValue')}
            value={row.estimatedValue ? isk(row.estimatedValue) : '—'}
          />
          <Fact
            label={t('corpTaxBook.moons.cols.mined')}
            value={<MinedBar pct={row.minedPct} label={names.refinery(row.structureId)} />}
          />
          <Fact
            label={t('corpTaxBook.moons.moon.oreFrom')}
            value={
              <span>
                {t(`corpTaxBook.moons.moon.source.${row.oreSource}`)}
                {row.chunkRate && (
                  <span className="block text-xs text-text-dim">
                    {t(`corpTaxBook.moons.moon.rate.${row.chunkRate.basis}`, {
                      rate: formatDecimal(row.chunkRate.m3PerHour),
                      count: row.chunkRate.cycles,
                    })}
                  </span>
                )}
                {canEdit && row.oreSource !== 'notification' && (
                  <button
                    type="button"
                    className={textActionClassName('ml-2')}
                    onClick={() => setLinking(true)}
                  >
                    {row.oreSource === 'survey'
                      ? t('corpTaxBook.moons.moon.link.change')
                      : t('corpTaxBook.moons.moon.link.open')}
                  </button>
                )}
              </span>
            }
          />
        </dl>
      </Panel>
      <BookSection
        title={t('corpTaxBook.moons.moon.whoMined')}
        noun={t('corpTaxBook.moons.sections.nouns.miners')}
        rows={miners}
        sortColumns={minerColumns}
        meta={
          <span className="text-xs text-text-dim">{t('corpTaxBook.moons.moon.minersHint')}</span>
        }
        phone={phone}
        summary={t('corpTaxBook.moons.moon.minersSummary', {
          count: miners.length,
          tax: isk(row.tax),
        })}
      >
        {(shown, table) => (
          <DataTable
            {...table}
            label={t('corpTaxBook.moons.moon.whoMined')}
            columns={minerColumns}
            rows={[...shown]}
            rowKey={(m) => m.minerId}
            expandableRow={{
              leadingIcon: true,
              renderDetail: (m) => (
                <OreLinesTable
                  lines={m.lines}
                  label={t('corpTaxBook.moons.moon.oreOf', { name: minerName(m) })}
                  foot={
                    <Link to={minerPath(m.minerId)} className={entityLinkClassName()}>
                      {t('corpTaxBook.moons.moon.openMiner')}
                    </Link>
                  }
                />
              ),
            }}
            density="compact"
            stackLayout="dense"
          />
        )}
      </BookSection>
      <BookSection
        title={t('corpTaxBook.moons.moon.past')}
        noun={t('corpTaxBook.moons.sections.nouns.cycles')}
        rows={detail.past}
        meta={<span className="text-xs text-text-dim">{t('corpTaxBook.moons.moon.pastHint')}</span>}
        phone={phone}
        startOpen={false}
        summary={t('corpTaxBook.moons.moon.pastSummary', { count: detail.past.length })}
      >
        {(shown) => (
          <DataTable
            label={t('corpTaxBook.moons.moon.past')}
            columns={cycleColumns}
            rows={[...shown]}
            rowKey={(r) => r.id}
            density="compact"
            stackColumns={2}
          />
        )}
      </BookSection>
      {linking && <LinkSurveyDialog open onClose={() => setLinking(false)} extractionId={row.id} />}
      <ReasonDialog
        open={dismissing}
        onClose={() => setDismissing(false)}
        title={t('corpTaxBook.moons.moon.dismissTitle')}
        intro={t('corpTaxBook.moons.moon.dismissIntro', { tax: isk(row.tax) })}
        reasonLabel={t('corpTaxBook.moons.dialogs.reasonShown')}
        confirmLabel={t('corpTaxBook.moons.dialogs.dismissConfirm', { amount: isk(row.tax) })}
        run={async (reason) => {
          await edit({
            action: 'dismiss',
            scope: 'extraction',
            targetId: row.id,
            reason,
            amountIsk: row.tax,
          });
        }}
      />
    </div>
  );
}
