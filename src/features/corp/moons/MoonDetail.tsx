import { createNumberFormat } from '@/lib/numberLocale';
import { formatCount } from '@/lib/formatCount';
import { useState } from 'react';
import { caretColumn } from './caretColumn';
import { useNavigate } from 'react-router-dom';
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
import { extractionDetail, type ExtractionRow } from '@/engine/corpTaxBook/bookView';
import { useBook } from './useBook';
import { ReasonDialog } from './BookDialogs';
import { LinkSurveyDialog } from './LinkSurveyDialog';
import { isk, shortDateTime } from './moonsFormat';
import { minerPath } from './moonsPaths';
import { Crumb, Fact, MinedBar, OreLine, StateWord } from './moonsParts';

const formatDecimal = createNumberFormat({ maximumFractionDigits: 3 });

/** A moon's page (#4056 step 2): this extraction, who mined it, earlier cycles. */
export function MoonDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const { view, names, edit, canEdit } = useBook();
  const navigate = useNavigate();
  const [dismissing, setDismissing] = useState(false);
  const [linking, setLinking] = useState(false);
  const detail = extractionDetail(view, id);
  if (!detail) {
    return (
      <div className="space-y-4">
        <Crumb to="/corp/moons/extractions" label={t('corpTaxBook.moons.tabs.extractions')} />
        <EmptyState title={t('corpTaxBook.moons.moon.notFound')} />
      </div>
    );
  }
  const { row } = detail;
  const minerColumns: DataTableColumn<(typeof detail.miners)[number]>[] = [
    {
      id: 'miner',
      header: t('corpTaxBook.moons.cols.miner'),
      primary: true,
      render: (m) => (
        <span className="text-accent">
          {names.character(view.miners.find((x) => x.id === m.minerId)?.mainCharacterId ?? 0)}
        </span>
      ),
    },
    {
      id: 'units',
      header: t('corpTaxBook.moons.cols.units'),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => formatCount(m.units),
    },
    {
      id: 'value',
      header: t('corpTaxBook.moons.cols.value'),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => isk(m.value),
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.tax'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (m) => isk(m.tax),
    },
    caretColumn<(typeof detail.miners)[number]>(),
  ];
  const cycleColumns: DataTableColumn<ExtractionRow>[] = [
    {
      id: 'fractured',
      header: t('corpTaxBook.moons.cols.fractured'),
      render: (r) => (r.fracturedAt ? shortDateTime(r.fracturedAt) : '—'),
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
        title={names.refinery(row.structureId)}
        meta={<span className="text-xs text-text-dim">{names.moon(row.moonId)}</span>}
      />
      <Panel
        title={t('corpTaxBook.moons.moon.thisExtraction')}
        meta={<StateWord state={row.state} />}
        actions={
          canEdit ? (
            row.tax > 0 ? (
              <Button size="sm" onClick={() => setDismissing(true)}>
                {t('corpTaxBook.moons.moon.dismiss')}
              </Button>
            ) : (
              <Tooltip content={t('corpTaxBook.moons.moon.dismissNone')}>
                <Button size="sm" aria-disabled="true">
                  {t('corpTaxBook.moons.moon.dismiss')}
                </Button>
              </Tooltip>
            )
          ) : undefined
        }
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          <Fact label={t('corpTaxBook.moons.moon.started')} value={shortDateTime(row.startedAt)} />
          <Fact
            label={t('corpTaxBook.moons.moon.arrived')}
            value={shortDateTime(row.chunkArrivalAt)}
          />
          <Fact
            label={t('corpTaxBook.moons.moon.fractured')}
            value={row.fracturedAt ? shortDateTime(row.fracturedAt) : '—'}
          />
          <Fact
            label={t('corpTaxBook.moons.moon.fieldGone')}
            value={
              row.expiresAt
                ? t('corpTaxBook.moons.moon.about', { at: shortDateTime(row.expiresAt) })
                : '—'
            }
          />
          <Fact label={t('corpTaxBook.moons.cols.ore')} value={<OreLine row={row} />} />
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
          <Fact
            label={t('corpTaxBook.moons.cols.estValue')}
            value={row.estimatedValue ? isk(row.estimatedValue) : '—'}
          />
          <Fact
            label={t('corpTaxBook.moons.cols.mined')}
            value={<MinedBar pct={row.minedPct} label={names.refinery(row.structureId)} />}
          />
        </dl>
      </Panel>
      <Panel title={t('corpTaxBook.moons.moon.whoMined')} padded={false}>
        {detail.miners.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-text-dim">{t('corpTaxBook.moons.moon.nobody')}</p>
        ) : (
          <DataTable
            label={t('corpTaxBook.moons.moon.whoMined')}
            columns={minerColumns}
            rows={detail.miners}
            rowKey={(m) => m.minerId}
            onRowClick={(m) => navigate(minerPath(m.minerId))}
            rowClassName={() => 'group'}
          />
        )}
      </Panel>
      <Panel
        title={t('corpTaxBook.moons.moon.past')}
        meta={<span className="text-xs text-text-dim">{t('corpTaxBook.moons.moon.pastHint')}</span>}
        padded={false}
      >
        {detail.past.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-text-dim">{t('corpTaxBook.moons.moon.noPast')}</p>
        ) : (
          <DataTable
            label={t('corpTaxBook.moons.moon.past')}
            columns={cycleColumns}
            rows={detail.past}
            rowKey={(r) => r.id}
            density="compact"
            stackColumns={2}
          />
        )}
      </Panel>
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
