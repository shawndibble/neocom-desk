import { formatCount } from '@/lib/formatCount';
import { useTimeZone } from '@/lib/timeFormat';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { textActionClassName } from '@/components/ui/textActionClassName';
import {
  extractionBilling,
  minersOnMoon,
  splitPlace,
  type MinerOnMoon,
} from '@/engine/corpTaxBook/bookSections';
import { extractionDetail, type ExtractionRow } from '@/engine/corpTaxBook/bookView';
import { extractionId as extractionIdOf } from '@/engine/corpTaxBook/sync';
import { useIsPhone } from '@/lib/useIsPhone';
import { useBook } from './useBook';
import { ReasonDialog } from './BookDialogs';
import { FILTER_STATES } from './extractionStates';
import { FullyMinedPanel } from './FullyMinedPanel';
import { LinkSurveyDialog } from './LinkSurveyDialog';
import { dateTimeAt, extractionWindowLabel, isk } from './moonsFormat';
import { extractionPath as extractionLink, minerPath } from './moonsPaths';
import { caretColumn } from './caretColumn';
import { Crumb, OreLine, StateWord } from './moonsParts';
import { OreLinesTable } from './OreLinesTable';
import { BookSection, EntityHeader, UndockableChip } from './sectionParts';

export function MoonDetail({ id }: { id: string }) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { view, names, edit, canEdit } = useBook();
  const phone = useIsPhone();
  const navigate = useNavigate();
  const [dismissing, setDismissing] = useState(false);
  const [linking, setLinking] = useState(false);
  const detail = extractionDetail(view, id);
  const miners = useMemo(() => minersOnMoon(view, id), [view, id]);
  const billing = useMemo(() => extractionBilling(view, id), [view, id]);
  if (!detail) {
    return (
      <div className="space-y-4">
        <Crumb to="/corp/moons/extractions" label={t('corpTaxBook.moons.tabs.extractions')} />
        <EmptyState title={t('corpTaxBook.moons.moon.notFound')} />
      </div>
    );
  }
  const { row } = detail;
  const surveyId = view.input.extractions.find((x) => extractionIdOf(x) === row.id)?.surveyId;
  const place = splitPlace(names.refinery(row.structureId), names.moon(row.moonId));
  const mined = miners.reduce((s, m) => s + m.value, 0);
  const left =
    row.estimatedValue !== null && row.minedPct !== null
      ? Math.round(row.estimatedValue * (1 - row.minedPct / 100))
      : null;
  const minersHint = t(
    billing.paid ? 'corpTaxBook.moons.moon.minersHintPaid' : 'corpTaxBook.moons.moon.minersHint'
  );
  const current = detail.otherCycles
    .filter((c) => c.startedAt > row.startedAt)
    .sort((x, y) => y.startedAt.localeCompare(x.startedAt))[0];
  const minerName = (m: MinerOnMoon) =>
    names.character(view.miners.find((x) => x.id === m.minerId)?.mainCharacterId ?? 0);
  const minerColumns: DataTableColumn<MinerOnMoon>[] = [
    {
      id: 'miner',
      header: t('corpTaxBook.moons.cols.miner'),
      primary: true,
      render: (m) => (
        <Link to={minerPath(m.minerId)} className={entityLinkClassName()}>
          {minerName(m)}
        </Link>
      ),
      sortValue: (m) => minerName(m),
    },
    {
      id: 'units',
      header: t('corpTaxBook.moons.cols.amount'),
      align: 'right',
      className: 'tabular-nums',
      stackAffix: { after: t('corpTaxBook.moons.sections.affix.units') },
      render: (m) => formatCount(m.units),
      sortValue: (m) => m.units,
    },
    {
      id: 'value',
      header: t('corpTaxBook.moons.cols.estValue'),
      align: 'right',
      className: 'tabular-nums',
      stackAffix: { after: t('corpTaxBook.moons.sections.affix.est') },
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
      render: (r) => (r.fracturedAt ? dateTimeAt(r.fracturedAt, zone) : '—'),
      sortValue: (r) => r.fracturedAt,
      sortFirst: 'desc',
    },
    {
      id: 'state',
      header: t('corpTaxBook.moons.cols.state'),
      render: (r) => <StateWord state={r.state} />,
      sortValue: (r) => FILTER_STATES.indexOf(r.state),
      sortFirst: 'asc',
    },
    {
      id: 'est',
      header: t('corpTaxBook.moons.cols.estValue'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => (r.estimatedValue ? isk(r.estimatedValue) : '—'),
      sortValue: (r) => r.estimatedValue ?? 0,
    },
    {
      id: 'mined',
      header: t('corpTaxBook.moons.cols.minedShort'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => (r.minedPct === null ? '—' : `${r.minedPct}%`),
      sortValue: (r) => r.minedPct ?? undefined,
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.taxRecorded'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (r) => isk(r.tax),
      sortValue: (r) => r.tax,
    },
    {
      id: 'miners',
      header: t('corpTaxBook.moons.cols.miners'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) => r.minerCount,
      sortValue: (r) => r.minerCount,
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
            {names.undockable?.(row.structureId) && <UndockableChip />}
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
        label={t(
          billing.paid ? 'corpTaxBook.moons.moon.taxPaid' : 'corpTaxBook.moons.moon.taxSoFar'
        )}
        value={isk(row.tax)}
        note={
          <>
            <OreLine row={row} {...(canEdit ? { onLink: () => setLinking(true) } : {})} />
            {surveyId !== undefined && (
              <Link to={`/s/${surveyId}`} className={entityLinkClassName('ml-2')}>
                {t('corpTaxBook.moons.moon.link.view')}
              </Link>
            )}
            {canEdit && row.oreLines.length > 0 && row.oreSource === 'survey' && (
              <button
                type="button"
                className={textActionClassName('ml-2 inline-flex')}
                onClick={() => setLinking(true)}
              >
                {t('corpTaxBook.moons.moon.link.change')}
              </button>
            )}
          </>
        }
        facts={[
          {
            label: t('corpTaxBook.moons.moon.window'),
            value: extractionWindowLabel(t, row, zone),
          },
          {
            label: t('corpTaxBook.moons.moon.estValue'),
            value: row.estimatedValue ? isk(row.estimatedValue) : '—',
          },
          {
            label: t('corpTaxBook.moons.moon.minedEst'),
            value: row.minedPct === null ? '—' : `${isk(mined)} · ${row.minedPct}%`,
          },
          ...(row.state === 'expired' || row.fullyMined
            ? []
            : [
                {
                  label: t('corpTaxBook.moons.moon.leftToMine'),
                  value: left === null ? '—' : `${isk(left)} · ${100 - (row.minedPct ?? 0)}%`,
                },
              ]),
          {
            label: t('corpTaxBook.moons.moon.fractured'),
            value: row.fracturedAt ? dateTimeAt(row.fracturedAt, zone) : '—',
          },
          {
            label: t('corpTaxBook.moons.moon.fieldGone'),
            value: row.expiresAt
              ? t('corpTaxBook.moons.moon.about', { at: dateTimeAt(row.expiresAt, zone) })
              : '—',
          },
        ]}
      />
      <FullyMinedPanel id={row.id} />
      <BookSection
        title={t('corpTaxBook.moons.moon.whoMined')}
        noun={t('corpTaxBook.moons.sections.nouns.miners')}
        rows={miners}
        sortColumns={minerColumns}
        empty={t('corpTaxBook.moons.moon.nobody')}
        meta={<span className="text-xs text-text-dim">{minersHint}</span>}
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
              toggleLabel: (m) => t('corpTaxBook.moons.moon.oreOf', { name: minerName(m) }),
              renderDetail: (m) => (
                <OreLinesTable
                  lines={m.lines}
                  showTotal={false}
                  label={t('corpTaxBook.moons.moon.oreOf', { name: minerName(m) })}
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
        empty={t('corpTaxBook.moons.moon.noOtherCycles')}
        rows={detail.otherCycles}
        sortColumns={cycleColumns}
        meta={
          <span className="text-xs text-text-dim">
            {t('corpTaxBook.moons.moon.pastHint')}
            {current && (
              <>
                {' · '}
                <Link to={extractionLink(current.id)} className={entityLinkClassName()}>
                  {t('corpTaxBook.moons.moon.currentCycle')}
                </Link>
              </>
            )}
          </span>
        }
        phone={phone}
        startOpen={false}
        summary={t('corpTaxBook.moons.moon.pastSummary', { count: detail.otherCycles.length })}
      >
        {(shown, table) => (
          <DataTable
            {...table}
            mobileSort
            label={t('corpTaxBook.moons.moon.past')}
            columns={[...cycleColumns, ...(table.stacked ? [] : [caretColumn<ExtractionRow>()])]}
            rows={[...shown]}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(extractionLink(r.id))}
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
