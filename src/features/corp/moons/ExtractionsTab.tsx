import { useCallback, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  EmptyState,
  MenuItem,
  Panel,
  RowActionsMenu,
  StatChip,
  StatChips,
  useOpenAfterMenu,
  type DataTableColumn,
} from '@/components/ui';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import type { ExtractionState } from '@/engine/corpTaxBook/extraction';
import { useBook } from './useBook';
import { caretColumn } from './caretColumn';
import { ReasonDialog } from './BookDialogs';
import { LinkSurveyDialog } from './LinkSurveyDialog';
import { ExtractionStateFilter, ExtractionTimeline } from './ExtractionTimeline';
import { DEFAULT_STATES, FILTER_STATES } from './extractionStates';
import { isk, shortDate, shortDateTime } from './moonsFormat';
import { extractionPath } from './moonsPaths';
import { PlaceCell } from './sectionParts';
import { MinedBar, OreLine, StateWord } from './moonsParts';

export function ExtractionsTab() {
  const { t } = useTranslation();
  const { view, names, canEdit, edit } = useBook();
  const [states, setStates] = useState<ReadonlySet<ExtractionState>>(DEFAULT_STATES);
  const toggleState = (state: ExtractionState) =>
    setStates((prev) => {
      const next = new Set(prev);
      if (!next.delete(state)) next.add(state);
      return next;
    });
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<ExtractionRow | null>(null);
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  const navigate = useNavigate();
  // Open moon page is the row click. Beyond it a row earns a menu only with two real actions:
  // Change survey (the ore came from a survey; an unknown-ore row has the visible Link button)
  // and Dismiss tax (inert at zero tax, so it does not count).
  const hasMenu = (row: ExtractionRow) => canEdit && row.oreSource === 'survey' && row.tax > 0;
  const rowContextMenu = useCallback(
    (row: ExtractionRow, tr: ReactElement) =>
      canEdit && row.oreSource === 'survey' && row.tax > 0 ? (
        <RowActionsMenu
          name={names.refinery(row.structureId)}
          openHref={extractionPath(row.id)}
          onCloseAutoFocus={onCloseAutoFocus}
          items={
            <>
              <MenuItem onSelect={() => run(() => setLinkingId(row.id))}>
                {t('corpTaxBook.moons.moon.link.change')}
              </MenuItem>
              <MenuItem onSelect={() => run(() => setDismissing(row))}>
                {t('corpTaxBook.moons.moon.dismiss')}
              </MenuItem>
            </>
          }
        >
          {tr}
        </RowActionsMenu>
      ) : (
        tr
      ),
    [canEdit, names, run, onCloseAutoFocus, t]
  );
  const rows = view.extractions;
  const listed = rows.filter((r) => states.has(r.state));
  const inChunks = rows
    .filter((r) => r.state !== 'expired' && r.state !== 'cancelled')
    .reduce((sum, r) => sum + (r.estimatedValue ?? 0), 0);

  const columns: DataTableColumn<ExtractionRow>[] = [
    {
      id: 'moon',
      header: t('corpTaxBook.moons.cols.moon'),
      primary: true,
      render: (row) => (
        <PlaceCell
          refinery={names.refinery(row.structureId)}
          moon={names.moon(row.moonId)}
          accent
        />
      ),
      sortValue: (row) => names.refinery(row.structureId),
    },
    {
      id: 'state',
      header: t('corpTaxBook.moons.cols.state'),
      render: (row) => <StateWord state={row.state} />,
      // State order (what is minable first), then the soonest chunk: the order the timeline lists them.
      sortValue: (row) => `${FILTER_STATES.indexOf(row.state)}|${row.chunkArrivalAt}`,
    },
    {
      id: 'when',
      header: t('corpTaxBook.moons.cols.when'),
      render: (row) => (
        <span className="block">
          {shortDateTime(row.fracturedAt ?? row.chunkArrivalAt)}
          <span className="block text-xs text-text-dim">
            {t('corpTaxBook.moons.startedOn', { date: shortDate(row.startedAt) })}
          </span>
        </span>
      ),
      sortValue: (row) => row.chunkArrivalAt,
    },
    {
      id: 'ore',
      header: t('corpTaxBook.moons.cols.ore'),
      render: (row) => (
        <OreLine row={row} {...(canEdit ? { onLink: () => setLinkingId(row.id) } : {})} />
      ),
    },
    {
      id: 'isk',
      header: t('corpTaxBook.moons.cols.estValue'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => (row.estimatedValue ? isk(row.estimatedValue) : '—'),
      sortValue: (row) => row.estimatedValue ?? 0,
    },
    {
      id: 'mined',
      header: t('corpTaxBook.moons.cols.mined'),
      render: (row) => <MinedBar pct={row.minedPct} label={names.refinery(row.structureId)} />,
    },
    caretColumn<ExtractionRow>((row) => hasMenu(row)),
  ];

  return (
    <div className="space-y-4">
      <StatChips>
        <StatChip
          label={t('corpTaxBook.moons.chips.inChunks')}
          value={isk(inChunks)}
          emphasis
          tooltip={t('corpTaxBook.moons.chips.inChunksTip')}
          tooltipGlyph="info"
        />
      </StatChips>
      <ExtractionTimeline
        rows={rows}
        states={states}
        filter={<ExtractionStateFilter rows={rows} states={states} onToggle={toggleState} />}
      />
      <Panel title={t('corpTaxBook.moons.tabs.extractions')} padded={false}>
        {listed.length === 0 ? (
          <EmptyState title={t('corpTaxBook.moons.extractionsNoneShown')} />
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              label={t('corpTaxBook.moons.tabs.extractions')}
              columns={columns}
              rows={listed}
              rowKey={(row) => row.id}
              onRowClick={(row) => navigate(extractionPath(row.id))}
              rowClassName={() => 'group'}
              rowContextMenu={rowContextMenu}
              rowMoreActions={canEdit}
              defaultSort={{ columnId: 'state', direction: 'asc' }}
              mobileSort
              stackColumns={2}
              stackSummary={t('corpTaxBook.moons.extractionsSummary', { count: listed.length })}
            />
          </div>
        )}
      </Panel>
      {dismissing && (
        <ReasonDialog
          open
          onClose={() => setDismissing(null)}
          title={t('corpTaxBook.moons.moon.dismissTitle')}
          intro={t('corpTaxBook.moons.moon.dismissIntro', { tax: isk(dismissing.tax) })}
          reasonLabel={t('corpTaxBook.moons.dialogs.reasonShown')}
          confirmLabel={t('corpTaxBook.moons.dialogs.dismissConfirm', {
            amount: isk(dismissing.tax),
          })}
          run={async (reason) => {
            await edit({
              action: 'dismiss',
              scope: 'extraction',
              targetId: dismissing.id,
              reason,
              amountIsk: dismissing.tax,
            });
          }}
        />
      )}
      {linkingId && (
        <LinkSurveyDialog open onClose={() => setLinkingId(null)} extractionId={linkingId} />
      )}
    </div>
  );
}
