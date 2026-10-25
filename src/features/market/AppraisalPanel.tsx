/**
 * The Market page's Appraisal tab: paste a pile of items, read what it is
 * worth on both sides of a Trade Hub's order book.
 *
 * The paste box stays beside the ledger rather than collapsing once a result
 * exists — an appraisal is usually edited two or three times (a line typo, a
 * stack left out), and a list you can still see is a list you can still fix.
 * That is also where unmatched lines are reported, next to the text they
 * refer to. Below `lg` the paste card sits above the result instead of
 * beside it and would push the answer a screen down, so there (and only once
 * a result exists) it folds into a one-line "N lines · Edit list" summary;
 * the unmatched report stays visible and the list is one tap away.
 *
 * The Browser's own two-column grid holds two halves: the paste box, one
 * `Panel`, narrower on the left since it does not need the width the Market
 * Group tree does; and the result column, which stacks the primary result
 * `Panel` (its header carries the Compare Hubs toggle) beneath the summary
 * and, when open, the Compare Hubs cards, once something has been appraised.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  Panel,
  Spinner,
  StatChip,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { Caret } from '@/components/ui/Disclosure';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { MUTAMARKET_SITE_URL } from '@/market/mutamarket';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { appraisalNet } from '@/engine/market/appraisal';
import { countPasteLines } from '@/engine/market/appraisalPaste';
import type { ResolvedStandings } from '@/engine/market/standings';

import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { ASSETS_ENDPOINTS, OWNED_EVERYWHERE, useAppraisalOwnedPref } from './appraisalOwnedPref';
import { useRecentAppraisals } from './appraisalRecent';

import { useHaulingCargo } from './haulingCargo';
import { useOwnedAtStation } from './useOwnedAtStation';
import { isValidPricePercent } from './pricePercent';
import { PastedLinesNote } from './PastedLinesNote';
import { AppraisalPasteCard } from './AppraisalPasteCard';
import { AppraisalResultActions } from './AppraisalResultActions';
import { AppraisalSummary } from './AppraisalSummary';
import { useAppraisalColumns } from './useAppraisalColumns';
import { useAppraisalCopyLists } from './useAppraisalCopyLists';
import { useAppraisalShare } from './useAppraisalShare';
import type { AppraisalController } from './useAppraisal';

interface AppraisalPanelProps {
  controller: AppraisalController;
  pricePercent: number;
  onPricePercentChange: (value: number) => void;
  /** The hub the figures are quoted at — the panel's own provenance chip, and what a Share Link is stored against. */
  hub: TradeHub;
  onHubChange: (id: TradeHub['id']) => void;
  /** The active Character's standing toward this hub's NPC station owner, for the net-of-fees chips' broker fee. */
  standing: ResolvedStandings;
  /** Signs in to store a Share Link as this Character if no Firebase session exists yet; null disables Share. */
  characterId: number | null;
  /** Opens the Compare Hubs panel already expanded — the Quickbar's "View in Appraisal" action (#726) lands directly on the multi-hub view rather than a collapsed one. */
  defaultCompareExpanded?: boolean;
}

export function AppraisalPanel({
  controller,
  pricePercent,
  onPricePercentChange,
  hub,
  onHubChange,
  standing,
  characterId,
  defaultCompareExpanded = false,
}: AppraisalPanelProps) {
  const { t } = useTranslation();
  const { text, result, compare, loading, failed } = controller;
  const [compareExpanded, setCompareExpanded] = useState(defaultCompareExpanded);
  // Phone only: the pilot opened the folded paste card to edit the list. The
  // result of an Appraise (or a Recent pick) from the open form folds it
  // again, adjusted during render like the idioms below. A re-price from a
  // changed Price % or hub also lands a new result, but must not pull the form
  // out from under someone mid-typing, hence the explicit request flag.
  const isDesktop = useIsDesktop();
  const [editingList, setEditingList] = useState(false);
  const [foldOnResult, setFoldOnResult] = useState(false);
  const [foldedFor, setFoldedFor] = useState(result);
  // The fold unmounts the focused Appraise button; below `lg` the Result heading
  // takes focus instead (WCAG 2.4.3), which also announces the result.
  const [focusResultTick, setFocusResultTick] = useState(0);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  if (result !== foldedFor) {
    setFoldedFor(result);
    if (foldOnResult) {
      setFoldOnResult(false);
      setEditingList(false);
      if (!isDesktop) setFocusResultTick((n) => n + 1);
    }
  }
  useEffect(() => {
    if (focusResultTick > 0) focusAfterCommit(resultHeadingRef);
  }, [focusResultTick, focusAfterCommit]);
  function appraiseFromForm(run: () => void) {
    setFoldOnResult(true);
    run();
  }
  const focusListOnOpen = useRef(false);
  useEffect(() => {
    if (!editingList || !focusListOnOpen.current) return;
    focusListOnOpen.current = false;
    document.getElementById('market-appraisal-text')?.focus();
  }, [editingList]);
  const hubName = hub.systemName;

  // Ages in the Recent list are read against when the panel opened.
  const [openedAt] = useState(Date.now);
  const recent = useRecentAppraisals((state) => state.value);
  const setRecent = useRecentAppraisals((state) => state.setValue);
  const ownedPref = useAppraisalOwnedPref((state) => state.value);
  const setOwnedPref = useAppraisalOwnedPref((state) => state.setValue);
  const cargo = useHaulingCargo((state) => state.value);
  const setCargo = useHaulingCargo((state) => state.setValue);
  useHydratedStore(useRecentAppraisals, useAppraisalOwnedPref, useHaulingCargo);

  const lacksAssets = useCharacterLacksEndpoints(characterId, ASSETS_ENDPOINTS);
  const minusOwned = ownedPref.enabled && !lacksAssets && characterId !== null;
  const ownedStationId = ownedPref.stationId ?? hub.stationId;
  const { owned, places, placeNames } = useOwnedAtStation(
    minusOwned,
    ownedPref.everywhere ? OWNED_EVERYWHERE : ownedStationId
  );
  const placeLabel = (id: number) =>
    TRADE_HUBS.find((h) => h.stationId === id)?.systemName ??
    placeNames.get(id) ??
    t(
      places.find((place) => place.id === id)?.kind === 'station'
        ? 'market.appraisal.minusOwnedUnknownStation'
        : 'market.appraisal.minusOwnedUnknownStructure',
      { id }
    );
  // Trade Hubs are always offered; any other place that holds stock joins them, and so does a saved pick not read yet.
  const otherPlaceIds = [
    ...places.map((place) => place.id),
    ...(places.some((place) => place.id === ownedStationId) ? [] : [ownedStationId]),
  ].filter((id, i, ids) => ids.indexOf(id) === i && !TRADE_HUBS.some((h) => h.stationId === id));
  const otherPlaces = otherPlaceIds.map((id) => ({ id, label: placeLabel(id) }));

  const {
    columns,
    rows,
    tableRows,
    tableExport,
    visibleColumns,
    availableColumns,
    optionalColumnsById,
    toggleColumn,
    rowContextMenu,
    hasRefine,
    hasLpOption,
  } = useAppraisalColumns({ controller, owned });
  const { share, handleShare, handleCopyShareUrl, shareItemCount } = useAppraisalShare({
    result,
    hub,
    pricePercent,
    characterId,
  });
  const { copied, copyLists, handleCopy } = useAppraisalCopyLists({ result, owned });

  /*
   * The percent field is a string while it is being typed. Committing on every
   * keystroke would fight the typist: clearing the box to retype "90" sends an
   * empty string, and a field that snaps back to 100 the moment you delete a
   * digit cannot be edited at all. So the box holds whatever is typed, and the
   * setting is only written when what is typed is a number in range.
   */
  const [percentText, setPercentText] = useState(String(pricePercent));
  const [lastPercent, setLastPercent] = useState(pricePercent);
  if (pricePercent !== lastPercent) {
    // Adjusted during render rather than in an effect — the same idiom
    // `Market.tsx` uses to reset its order book when the selection changes,
    // and for the same reason: an effect would paint the stale value first.
    // A value the pilot is mid-way through typing does not land here, because
    // that path only writes `pricePercent` once what is typed has parsed.
    setLastPercent(pricePercent);
    if (Number(percentText) !== pricePercent) setPercentText(String(pricePercent));
  }

  function handlePercentChange(next: string) {
    setPercentText(next);
    const parsed = Number(next);
    if (next.trim() !== '' && isValidPricePercent(parsed)) onPricePercentChange(parsed);
  }

  const totals = result?.appraisal.totals;
  const unmatched = result?.unmatched ?? [];
  const abyssalLines = result?.abyssal ?? [];
  const accountingLevel = result?.accountingLevel ?? null;
  const brokerRelationsLevel = result?.brokerRelationsLevel ?? null;
  // Null while skills are loading, or with no active Character — falls back
  // to the result panel's own loading/empty states rather than ever showing
  // a base-rate (untrained) figure.
  const net = useMemo(() => {
    if (result === null || accountingLevel === null || brokerRelationsLevel === null) return null;
    return appraisalNet(
      result.appraisal.items,
      { accountingLevel, brokerRelationsLevel, standing },
      pricePercent
    );
  }, [result, accountingLevel, brokerRelationsLevel, standing, pricePercent]);
  const pasteFolded = !isDesktop && rows.length > 0 && !editingList;
  // Abyssal modules are real items with no market price: said apart from the
  // unmatched lines, with where to price one instead.
  const abyssalNote = abyssalLines.length > 0 && (
    <PastedLinesNote
      heading={t('market.appraisal.abyssal', { count: abyssalLines.length })}
      entries={abyssalLines}
    >
      <p className="pt-1 text-[0.6875rem] text-text-dim">
        {t('market.appraisal.abyssalHint')}{' '}
        <ExternalLink href={MUTAMARKET_SITE_URL}>{t('market.appraisal.abyssalLink')}</ExternalLink>
      </p>
    </PastedLinesNote>
  );
  const unmatchedLinesNote = unmatched.length > 0 && (
    <PastedLinesNote
      heading={
        <>
          <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
          {t('market.appraisal.unmatched', { count: unmatched.length })}
        </>
      }
      headingClassName="flex items-center gap-1.5 text-warning"
      entries={unmatched}
    />
  );
  // About the pasted list, so it shows folded or open.
  const unmatchedNote = (unmatchedLinesNote || abyssalNote) && (
    <div className="flex flex-col gap-2">
      {unmatchedLinesNote}
      {abyssalNote}
    </div>
  );

  const minusOwnedLabel = !minusOwned
    ? null
    : ownedPref.everywhere
      ? t('market.appraisal.minusOwnedChipEverywhere')
      : t('market.appraisal.minusOwnedChip', { station: placeLabel(ownedStationId) });

  const summaryReady =
    !(loading && result === null) &&
    !failed &&
    result !== null &&
    totals !== undefined &&
    rows.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[18rem_minmax(0,1fr)]">
      {pasteFolded ? (
        <div className="flex flex-col gap-2 rounded-xs border border-line bg-panel/85">
          <button
            type="button"
            aria-expanded={false}
            onClick={() => {
              focusListOnOpen.current = true;
              setEditingList(true);
            }}
            className={`flex min-h-9 w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs ${rowInteractiveClassName} ${focusRingInsetClassName}`}
          >
            <Caret expanded={false} />
            <span className="font-medium">
              {t('market.appraisal.pasteFolded', { count: countPasteLines(text) })}
            </span>
            <span className="text-text-dim">
              {t('market.appraisal.pasteFoldedMeta', { hub: hubName, percent: pricePercent })}
            </span>
          </button>
          {unmatchedNote && <div className="px-3 pb-3">{unmatchedNote}</div>}
        </div>
      ) : (
        <AppraisalPasteCard
          controller={controller}
          hub={hub}
          onHubChange={onHubChange}
          characterId={characterId}
          percentText={percentText}
          onPercentChange={handlePercentChange}
          minusOwned={minusOwned}
          lacksAssets={lacksAssets}
          ownedPref={ownedPref}
          setOwnedPref={setOwnedPref}
          ownedStationId={ownedStationId}
          otherPlaces={otherPlaces}
          recent={recent}
          setRecent={setRecent}
          openedAt={openedAt}
          appraiseFromForm={appraiseFromForm}
          unmatchedNote={unmatchedNote}
        />
      )}

      <div className="flex flex-col gap-4">
        {summaryReady && result !== null && totals !== undefined && (
          // The summary groups, hold line and hub cards sit on the page ground; the
          // table below is the only Panel (DESIGN.md §6c, boxes in boxes).
          <AppraisalSummary
            result={result}
            compare={compare}
            compareExpanded={compareExpanded}
            loading={loading}
            net={net}
            itemCount={rows.length}
            hasRefine={hasRefine}
            hasLpOption={hasLpOption}
            minusOwnedLabel={minusOwnedLabel}
            cargo={cargo}
            onCargoChange={(next) => void setCargo(next)}
            characterId={characterId}
            hubId={hub.id}
            onHubChange={onHubChange}
          />
        )}

        <Panel
          title={t('market.appraisal.resultTitle')}
          headingRef={resultHeadingRef}
          padded={result === null}
          meta={
            result !== null ? (
              // The paste bar above already says hub and percent on a phone.
              <span className="max-md:hidden">
                <StatChip
                  label={hubName}
                  value={t('market.appraisal.atPercent', { pricePercent })}
                />
              </span>
            ) : undefined
          }
          actions={
            result === null || failed || rows.length === 0 ? undefined : (
              <AppraisalResultActions
                compare={compare}
                compareExpanded={compareExpanded}
                onToggleCompare={() => setCompareExpanded((open) => !open)}
                columns={{
                  availableColumns,
                  visibleColumns,
                  optionalColumnsById,
                  toggleColumn,
                  tableExport,
                }}
                share={{ share, handleShare, shareItemCount }}
                copy={{ copied, copyLists, handleCopy }}
                characterId={characterId}
                rowCount={rows.length}
              />
            )
          }
        >
          {loading && result === null ? (
            <div className="flex justify-center py-8">
              <Spinner label={t('common.loading')} />
            </div>
          ) : failed ? (
            <EmptyState
              title={t('market.loadFailedTitle')}
              hint={t('market.loadFailedHint')}
              className="py-8"
            />
          ) : result === null || totals === undefined ? (
            <EmptyState
              title={t('market.appraisal.emptyTitle')}
              hint={t('market.appraisal.emptyHint')}
              className="py-8"
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('market.appraisal.noMatchesTitle')}
              hint={t('market.appraisal.noMatchesHint')}
              className="py-8"
            />
          ) : (
            <>
              {share.status === 'manual' && (
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                  <label htmlFor="market-appraisal-share-url" className={eyebrowClassName}>
                    {t('market.appraisal.shareReady')}
                  </label>
                  <TextInput
                    id="market-appraisal-share-url"
                    size="sm"
                    readOnly
                    value={share.url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 font-mono"
                  />
                  <Button size="sm" onClick={() => void handleCopyShareUrl(share.url)}>
                    {t('market.appraisal.shareCopy')}
                  </Button>
                </div>
              )}
              {/* A card a little narrower than the table's own minimum scrolls here instead of pushing past its column (#2949). */}
              <div className="min-w-0 overflow-x-auto">
                <DataTable
                  {...tableExport.tableProps}
                  columns={columns}
                  rows={tableRows}
                  rowKey={(row) => row.typeId}
                  label={t('market.appraisal.resultTitle')}
                  className="pb-1"
                  rowContextMenu={rowContextMenu}
                  rowMoreActions
                  // A phone keeps the table: Item, Buy, Sell, each header sorts.
                  responsive="table"
                />
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
