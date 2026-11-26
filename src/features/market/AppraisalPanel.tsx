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
  Toast,
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
import { QuantityColumnModal } from './QuantityColumnModal';
import { quantityColumnChoices } from '@/engine/market/appraisalPaste';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { AppraisalResultActions } from './AppraisalResultActions';
import { AppraisalSummary } from './AppraisalSummary';
import { LivePriceBar, LivePriceStatus } from './LivePriceStatus';
import { useAppraisalColumns } from './useAppraisalColumns';
import { useAppraisalCopyLists } from './useAppraisalCopyLists';
import { useAppraisalJanice } from './useAppraisalJanice';
import { useAppraisalShare } from './useAppraisalShare';
import { RefineBreakdownModal } from './RefineBreakdownModal';
import { TurnInBreakdown } from '@/features/campaigns/TurnInBreakdown';
import { useAppraisalTurnIns } from './useAppraisalTurnIns';
import { efficiencyText } from './refineFormat';
import { useRefineMineralNames } from './useRefineMineralNames';
import { useAltChord } from '@/lib/useChord';
import { useRefiningSetup } from '@/features/refining/useRefiningSetup';
import { useRefineBasis } from './refineBasis';
import { DEFAULT_REFINING_SETUP } from '@/engine/industry/refiningSetup';
import { basisAvailable, refineEfficiencyRange } from '@/engine/market/refineBreakdown';
import type { AppraisalItem, RefineBasis } from '@/engine/market/appraisal';
import type { AppraisalController } from './useAppraisal';

interface AppraisalPanelProps {
  controller: AppraisalController;
  pricePercent: number;
  onPricePercentChange: (value: number) => void;
  hub: TradeHub;
  onHubChange: (id: TradeHub['id']) => void;
  onHubPicked: () => void;
  standing: ResolvedStandings;
  characterId: number | null;
  defaultCompareExpanded?: boolean;
}

const NO_ITEMS: readonly AppraisalItem[] = [];

export function AppraisalPanel({
  controller,
  pricePercent,
  onPricePercentChange,
  hub,
  onHubChange,
  onHubPicked,
  standing,
  characterId,
  defaultCompareExpanded = false,
}: AppraisalPanelProps) {
  const { t } = useTranslation();
  const { text, result, compare, loading, failed } = controller;
  const [compareExpanded, setCompareExpanded] = useState(defaultCompareExpanded);
  const { setCompareOpen } = controller;
  useEffect(() => setCompareOpen(compareExpanded), [compareExpanded, setCompareOpen]);
  const isDesktop = useIsDesktop();
  const [editingList, setEditingList] = useState(false);
  const [foldOnResult, setFoldOnResult] = useState(false);
  const [foldedFor, setFoldedFor] = useState(result);
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

  const [openedAt] = useState(Date.now);
  const recent = useRecentAppraisals((state) => state.value);
  const setRecent = useRecentAppraisals((state) => state.setValue);
  const ownedPref = useAppraisalOwnedPref((state) => state.value);
  const setOwnedPref = useAppraisalOwnedPref((state) => state.setValue);
  const cargo = useHaulingCargo((state) => state.value);
  const setCargo = useHaulingCargo((state) => state.setValue);
  useHydratedStore(useRecentAppraisals, useAppraisalOwnedPref, useHaulingCargo);

  const [refineModal, setRefineModal] = useState<{ typeId: number | null } | null>(null);
  const refiningSetup = useRefiningSetup();
  const storedBasis = useRefineBasis((state) => state.value);
  const setStoredBasis = useRefineBasis((state) => state.setValue);
  const basisReady = useHydratedStore(useRefineBasis);
  const refineBasis: RefineBasis =
    result !== null && basisAvailable(result.appraisal, storedBasis) ? storedBasis : 'buy';
  const mineralNames = useRefineMineralNames(result?.appraisal.items ?? NO_ITEMS);
  const turnIns = useAppraisalTurnIns({
    rows: result?.appraisal.rows,
    hub,
    characterId,
    refineBasis,
  });
  const [turnInOpen, setTurnInOpen] = useState(false);

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
  } = useAppraisalColumns({
    controller,
    owned,
    standing,
    onOpenRefine: (typeId) => setRefineModal({ typeId }),
    refineBasis,
    refineReady: basisReady,
    turnIns,
  });
  const { share, handleShare, handleCopyShareUrl, shareItemCount } = useAppraisalShare({
    result,
    hub,
    pricePercent,
    characterId,
  });
  const { copied, pending, copyLists, handleCopy } = useAppraisalCopyLists({
    result,
    owned,
    settleLive: controller.settleLive,
    refineBasis,
    turnIn: turnIns.lookup,
  });
  const { janice, handleOpenInJanice, dismissJanice } = useAppraisalJanice({
    text,
    hub,
    pricePercent,
  });
  const canOpenInJanice = text.trim() !== '' && janice.status !== 'fetching';
  useAltChord('KeyJ', () => void handleOpenInJanice(), canOpenInJanice);

  const [percentText, setPercentText] = useState(String(pricePercent));
  const [lastPercent, setLastPercent] = useState(pricePercent);
  if (pricePercent !== lastPercent) {
    setLastPercent(pricePercent);
    if (Number(percentText) !== pricePercent) setPercentText(String(pricePercent));
  }

  function handlePercentChange(next: string) {
    setPercentText(next);
    const parsed = Number(next);
    if (next.trim() !== '' && isValidPricePercent(parsed)) onPricePercentChange(parsed);
  }

  const refineRange = useMemo(
    () => (result ? refineEfficiencyRange(result.appraisal.items) : null),
    [result]
  );
  const refineEfficiency = refineRange ? efficiencyText(refineRange.min, refineRange.max) : null;
  const refineSetup = result?.refining ?? DEFAULT_REFINING_SETUP;

  const totals = result?.appraisal.totals;
  const unmatched = result?.unmatched ?? [];
  const abyssalLines = result?.abyssal ?? [];
  const accountingLevel = result?.accountingLevel ?? null;
  const brokerRelationsLevel = result?.brokerRelationsLevel ?? null;
  const net = useMemo(() => {
    if (result === null || accountingLevel === null || brokerRelationsLevel === null) return null;
    return appraisalNet(
      result.appraisal.items,
      { accountingLevel, brokerRelationsLevel, standing },
      pricePercent
    );
  }, [result, accountingLevel, brokerRelationsLevel, standing, pricePercent]);
  const pasteFolded = !isDesktop && rows.length > 0 && !editingList;
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
  const textLines =
    result?.pasteText === controller.submitted ? (result.textQuantityLines ?? []) : [];
  const quantityChoices = quantityColumnChoices(textLines);
  const [quantityOfferedFor, setQuantityOfferedFor] = useState<string | null>(null);
  const [quantityOpen, setQuantityOpen] = useState(false);
  if (
    quantityChoices.length > 0 &&
    controller.quantityColumn === null &&
    quantityOfferedFor !== controller.submitted
  ) {
    setQuantityOfferedFor(controller.submitted);
    setQuantityOpen(true);
  }
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
    >
      {textLines.length > 0 && (
        <p className="pt-1 text-[0.6875rem] text-text-dim">
          {t('market.appraisal.quantityTextHint')}
          {quantityChoices.length > 0 && (
            <>
              {' '}
              <button
                type="button"
                className={inlineLinkClassName}
                onClick={() => setQuantityOpen(true)}
              >
                {t('market.appraisal.quantityColumn.link')}
              </button>
            </>
          )}
        </p>
      )}
    </PastedLinesNote>
  );
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

  const resultReady = !failed && result !== null && rows.length > 0;
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
          shownHubId={hub.id}
          onHubPicked={onHubPicked}
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
          <AppraisalSummary
            result={result}
            compare={compare}
            compareExpanded={compareExpanded}
            loading={loading}
            net={net}
            itemCount={rows.length}
            showRefine={hasRefine && visibleColumns.includes('refineTotal')}
            hasLpOption={hasLpOption}
            minusOwnedLabel={minusOwnedLabel}
            cargo={cargo}
            onCargoChange={(next) => void setCargo(next)}
            characterId={characterId}
            hubId={hub.id}
            onHubChange={onHubChange}
            compareLive={controller.compareLive}
            refineEfficiency={refineEfficiency}
            refineBasis={refineBasis}
            onOpenRefine={() => setRefineModal({ typeId: null })}
            turnIn={
              turnIns.pile.length > 0
                ? {
                    total: turnIns.total,
                    count: turnIns.pile.length,
                    onOpen: () => setTurnInOpen(true),
                  }
                : null
            }
          />
        )}

        <div className="relative">
          {resultReady && controller.live.checking && (
            <LivePriceBar live={controller.live} className="absolute inset-x-0 top-0 z-10" />
          )}
          <Panel
            title={t('market.appraisal.resultTitle')}
            headingRef={resultHeadingRef}
            padded={result === null}
            wrapMeta
            meta={
              result !== null ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="max-md:hidden">
                    <StatChip
                      label={hubName}
                      value={t('market.appraisal.atPercent', { pricePercent })}
                    />
                  </span>
                  <LivePriceStatus live={controller.live} />
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
                  copy={{ copied, pending, copyLists, handleCopy }}
                  janice={{ handleOpenInJanice, canOpen: canOpenInJanice }}
                  characterId={characterId}
                  rowCount={rows.length}
                />
              )
            }
          >
            {loading && result === null ? (
              <Spinner block="panel" label={t('common.loading')} />
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
                    responsive="table"
                  />
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
      <QuantityColumnModal
        open={quantityOpen && quantityChoices.length > 0}
        onClose={() => setQuantityOpen(false)}
        onChoose={(column) => {
          setQuantityOpen(false);
          controller.chooseQuantityColumn(column);
        }}
        lines={textLines}
        choices={quantityChoices}
      />
      {refineModal !== null && result !== null && (
        <RefineBreakdownModal
          open
          onClose={() => setRefineModal(null)}
          appraisal={result.appraisal}
          pricePercent={pricePercent}
          hubName={hubName}
          setup={{ yieldRate: refineSetup.stationRate, taxRate: refineSetup.taxRate }}
          mineralNames={mineralNames}
          initialTypeId={refineModal.typeId}
          basis={refineBasis}
          onBasisChange={(next) => void setStoredBasis(next)}
          editSetup={{
            onYield: (fraction) => void refiningSetup.setYieldRate(fraction),
            onTax: (fraction) => void refiningSetup.setTaxRate(fraction),
          }}
        />
      )}
      {turnInOpen && turnIns.pile.length > 0 && (
        <TurnInBreakdown
          open
          onClose={() => setTurnInOpen(false)}
          items={turnIns.pile}
          surfaceLine={t('market.appraisal.turnIn.breakdownLine')}
        />
      )}
      {janice.status === 'fetching' && <Toast message={t('market.appraisal.janiceFetching')} />}
      {janice.status === 'failed' && (
        <Toast
          message={t(`market.appraisal.janiceFailed.${janice.reason}`)}
          tone="danger"
          instance={janice}
          onClose={dismissJanice}
        />
      )}
    </div>
  );
}
