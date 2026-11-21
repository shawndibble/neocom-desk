import { Link, useNavigate } from 'react-router-dom';
import { useTimeZone } from '@/lib/timeFormat';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  EmptyState,
  Panel,
  entityLinkClassName,
  type DataTableColumn,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { splitPlace } from '@/engine/corpTaxBook/bookSections';
import { cx } from '@/lib/cx';
import { setRefineryArchive } from '../taxBook/feederClient';
import { ArchivedRefineries } from './ArchivedRefineries';
import { caretColumn } from './caretColumn';
import { FILTER_STATES } from './extractionStates';
import { isk, shortDateTime } from './moonsFormat';
import { refineryPath } from './moonsPaths';
import { offerLabel } from './refineryText';
import { UndockableChip } from './sectionParts';
import { tapTargetClassName } from './sectionHelpers';
import { useBook } from './useBook';
import { useRefineryList, type RefineryEntry } from './useRefineryList';

/**
 * Every refinery the book knows (#6348): one row each, refinery name first and its moon under it,
 * for the corporation's own refineries and moon owners'. The row opens the refinery's page; an
 * archived moon owner refinery leaves the table for the folded Archived section.
 */
export function RefineriesTab() {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { names, corporationId, canEdit, characterId, reload, data } = useBook();
  const navigate = useNavigate();
  const list = useRefineryList();
  const nameOf = (r: Pick<RefineryEntry, 'structureId' | 'ownerId'>) =>
    r.ownerId === undefined ? names.refinery(r.structureId) : names.ownerRefinery(r.structureId);
  // A book that reads moon owners' refineries names each one's corporation (#6097).
  const namesCorporations = list.active.some((r) => r.ownerId !== undefined);
  const states = (row: RefineryEntry) =>
    FILTER_STATES.filter((s) => row.states[s])
      .map((s) => `${row.states[s]} ${t(`corpTaxBook.moons.state.${s}`)}`)
      .join(' · ');

  const columns: DataTableColumn<RefineryEntry>[] = [
    {
      id: 'refinery',
      header: t('corpTaxBook.moons.cols.refinery'),
      primary: true,
      render: (row) => {
        const moon = row.moonId === undefined ? undefined : names.moon(row.moonId);
        const place = splitPlace(nameOf(row), moon);
        return (
          <span className="block min-w-0">
            <Link
              to={refineryPath(row.structureId)}
              className={entityLinkClassName(cx('[overflow-wrap:anywhere]', tapTargetClassName))}
            >
              {place.moon === undefined ? nameOf(row) : place.station}
            </Link>
            {names.undockable?.(row.structureId) && <UndockableChip />}
            <span className="block text-xs text-text-dim">
              {moon ?? t('corpTaxBook.moons.refineryPage.moonUnknown')}
            </span>
            {row.row?.offer && (
              <Pill tone="warning" className="mt-0.5">
                {offerLabel(t, row.row.offer)}
              </Pill>
            )}
          </span>
        );
      },
      sortValue: (row) => nameOf(row),
    },
    ...(namesCorporations
      ? [
          {
            id: 'owner',
            header: t('corpTaxBook.moons.cols.owner'),
            render: (row: RefineryEntry) => names.corporation(row.ownerId ?? corporationId),
            sortValue: (row: RefineryEntry) => names.corporation(row.ownerId ?? corporationId),
          },
        ]
      : []),
    {
      id: 'extractions',
      header: t('corpTaxBook.moons.tabs.extractions'),
      render: (row) => (
        <span className="block">
          {row.extractionCount}
          <span className="block text-xs text-text-dim">{states(row)}</span>
        </span>
      ),
      sortValue: (row) => row.extractionCount,
    },
    {
      id: 'pop',
      header: t('corpTaxBook.moons.cols.pop'),
      render: (row) =>
        row.nextPopAt
          ? t('corpTaxBook.moons.moons.nextPop', { date: shortDateTime(row.nextPopAt, zone) })
          : row.lastPopAt
            ? t('corpTaxBook.moons.moons.lastPop', { date: shortDateTime(row.lastPopAt, zone) })
            : '—',
      sortValue: (row) => row.nextPopAt ?? row.lastPopAt,
    },
    {
      id: 'tax',
      header: t('corpTaxBook.moons.cols.tax'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => (row.tax ? isk(row.tax) : '—'),
      sortValue: (row) => row.tax,
    },
    caretColumn<RefineryEntry>(),
  ];

  const ownerOf = new Map(list.archived.map((a) => [a.row.structureId, a.ownerId]));
  return (
    <div className="space-y-4">
      <Panel title={t('corpTaxBook.moons.tabs.refineries')} padded={false}>
        {list.active.length === 0 ? (
          <EmptyState title={t('corpTaxBook.moons.refineries.none')} />
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              label={t('corpTaxBook.moons.tabs.refineries')}
              columns={columns}
              rows={list.active}
              rowKey={(row) => String(row.structureId)}
              onRowClick={(row) => navigate(refineryPath(row.structureId))}
              defaultSort={{ columnId: 'refinery', direction: 'asc' }}
              mobileSort
              stackColumns={2}
              stackSummary={t('corpTaxBook.moons.refineries.summary', {
                count: list.active.length,
              })}
            />
          </div>
        )}
      </Panel>
      <ArchivedRefineries
        rows={list.archived.map((a) => a.row)}
        name={(id) => names.ownerRefinery(id)}
        moonName={(r) => (r.moonId === undefined ? undefined : names.moon(r.moonId))}
        pathOf={refineryPath}
        byName={names.character}
        canRestore={(structureId) => {
          const status = data.feeders?.find(
            (f) => f.corporationId === ownerOf.get(structureId)
          )?.status;
          return status !== 'left' && status !== 'removed';
        }}
        {...(canEdit
          ? {
              onRestore: async (structureId: number) => {
                try {
                  await setRefineryArchive(
                    characterId,
                    corporationId,
                    ownerOf.get(structureId)!,
                    structureId,
                    false
                  );
                } finally {
                  reload();
                }
              },
            }
          : {})}
      />
    </div>
  );
}
