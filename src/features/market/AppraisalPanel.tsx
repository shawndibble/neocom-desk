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
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  IconButton,
  MenuItem,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatChip,
  TextArea,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { Caret } from '@/components/ui/Disclosure';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { MUTAMARKET_SITE_URL } from '@/market/mutamarket';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { GrantNote } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { formatAge } from '@/lib/age';
import { useIsDesktop } from '@/lib/useIsDesktop';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { appraisalNet } from '@/engine/market/appraisal';
import { countPasteLines, pasteBoxRows } from '@/engine/market/appraisalPaste';
import { MAX_SNAPSHOT_ITEMS } from '@/engine/market/appraisalSnapshot';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { EsiEndpointId } from '@/esi/registry';

import { isSyncConfigured } from '@/app/syncStatus';
import { useIsPhone } from '@/lib/useIsPhone';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { useAppraisalOwnedPref } from './appraisalOwnedPref';
import { recentLabel, useRecentAppraisals } from './appraisalRecent';

// Reserved Select value for the action item; real entries use their list index.
const CLEAR_RECENT = 'clear';
import { AppraisalHeaderStats } from './AppraisalHeaderStats';
import { AppraisalHoldBar } from './AppraisalHoldBar';
import { useHaulingCargo } from './haulingCargo';
import { useOwnedAtStation } from './useOwnedAtStation';
import { formatVolume } from './format';
import { HubCompareCards } from './HubCompareCards';
import { isValidPricePercent, MAX_PRICE_PERCENT, MIN_PRICE_PERCENT } from './pricePercent';
import { PastedLinesNote } from './PastedLinesNote';
import { useAppraisalColumns } from './useAppraisalColumns';
import { useAppraisalCopyLists, COPY_LISTS } from './useAppraisalCopyLists';
import { useAppraisalShare } from './useAppraisalShare';
import type { AppraisalController } from './useAppraisal';

const ASSETS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterAssets'];

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

/** The "Minus owned" picker's value for every location, apart from any station id. */
const OWNED_EVERYWHERE = 'all' as const;
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
  const isPhone = useIsPhone();
  const { text, setText, result, compare, loading, failed } = controller;
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
  const hydrateRecent = useRecentAppraisals((state) => state.hydrate);
  const setRecent = useRecentAppraisals((state) => state.setValue);
  const ownedPref = useAppraisalOwnedPref((state) => state.value);
  const hydrateOwnedPref = useAppraisalOwnedPref((state) => state.hydrate);
  const setOwnedPref = useAppraisalOwnedPref((state) => state.setValue);
  const cargo = useHaulingCargo((state) => state.value);
  const hydrateCargo = useHaulingCargo((state) => state.hydrate);
  const setCargo = useHaulingCargo((state) => state.setValue);
  useEffect(() => {
    void hydrateRecent();
    void hydrateOwnedPref();
    void hydrateCargo();
  }, [hydrateRecent, hydrateOwnedPref, hydrateCargo]);

  const lacksAssets = useCharacterLacksEndpoints(characterId, ASSETS_ENDPOINTS);
  const minusOwned = ownedPref.enabled && !lacksAssets && characterId !== null;
  const ownedStationId = ownedPref.stationId ?? hub.stationId;
  const ownedStation = TRADE_HUBS.find((h) => h.stationId === ownedStationId) ?? hub;
  const { owned } = useOwnedAtStation(
    minusOwned,
    ownedPref.everywhere ? OWNED_EVERYWHERE : ownedStationId
  );

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
  const implantBonusPct = result?.implantBonusPct ?? 0;
  const refinesOreOrIce = result?.refinesOreOrIce ?? false;
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
            className={`flex min-h-11 w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs ${rowInteractiveClassName} ${focusRingInsetClassName}`}
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
        <Panel
          title={t('market.appraisal.pasteTitle')}
          actions={
            recent.length > 0 ? (
              <Select
                value=""
                onValueChange={(value) => {
                  if (value === CLEAR_RECENT) void setRecent([]);
                  else
                    appraiseFromForm(() =>
                      controller.appraiseText(recent[Number(value)]?.text ?? '')
                    );
                }}
              >
                <SelectTrigger
                  size="sm"
                  id="market-appraisal-recent"
                  aria-label={t('market.appraisal.recentPlaceholder')}
                  className="w-32 max-w-full min-w-0"
                >
                  <SelectValue placeholder={t('market.appraisal.recentPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {recent.map((entry, index) => {
                    const { names, more } = recentLabel(entry.text);
                    return (
                      <SelectItem key={entry.text} value={String(index)}>
                        {t(
                          more > 0
                            ? 'market.appraisal.recentLabelMore'
                            : 'market.appraisal.recentLabel',
                          {
                            names: names.join(', '),
                            count: more,
                            age: formatAge(openedAt - entry.savedAt, t),
                          }
                        )}
                      </SelectItem>
                    );
                  })}
                  <SelectSeparator />
                  <SelectItem value={CLEAR_RECENT} className="text-text-dim">
                    {t('market.appraisal.clearRecent')}
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : undefined
          }
          meta={
            controller.canAppraise ? (
              <StatChip
                label={t('market.appraisal.linesLabel')}
                // The box's own line count, which is deliberately not the
                // table's row count: repeated names merge into one priced row,
                // so "15 lines" and "14 items" can both be true. Split by the
                // parser's own rule rather than a second regex here, so the two
                // can never disagree about what a line is.
                value={formatVolume(countPasteLines(text))}
              />
            ) : undefined
          }
        >
          <div className="flex flex-col gap-2">
            <label className="block text-xs text-text-dim" htmlFor="market-appraisal-text">
              {t('market.appraisal.pasteLabel')}
            </label>
            <TextArea
              id="market-appraisal-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onSubmitChord={() => {
                if (controller.canAppraise && !loading) appraiseFromForm(controller.appraise);
              }}
              rows={pasteBoxRows(text)}
              spellCheck={false}
              placeholder={t('market.appraisal.pastePlaceholder')}
              mono
              className="text-[0.6875rem]"
            />

            <div className="flex items-center gap-2">
              <label
                className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
                htmlFor="market-appraisal-percent"
              >
                {t('market.appraisal.pricePercentLabel')}
              </label>
              <TextInput
                id="market-appraisal-percent"
                size="sm"
                type="number"
                inputMode="decimal"
                min={MIN_PRICE_PERCENT}
                max={MAX_PRICE_PERCENT}
                value={percentText}
                onChange={(event) => handlePercentChange(event.target.value)}
                className="field-no-spinner w-16 text-right"
              />
              <Select
                value={hub.id}
                onValueChange={(value) => onHubChange(value as TradeHub['id'])}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={t('market.tradeHub')}
                  className="min-w-0 flex-1"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRADE_HUBS.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.systemName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              {/* One sentence: "Minus what I own at [Jita]". The picker stays put, disabled, while the box is unticked. */}
              <div className="flex flex-wrap items-center gap-x-2">
                <label className={`flex items-center gap-2 text-xs ${tappableRowClassName}`}>
                  <Checkbox
                    checked={minusOwned}
                    disabled={lacksAssets || characterId === null}
                    onChange={(event) =>
                      void setOwnedPref({ ...ownedPref, enabled: event.target.checked })
                    }
                  />
                  {t('market.appraisal.minusOwned')}
                </label>
                <Select
                  disabled={!minusOwned}
                  value={ownedPref.everywhere ? OWNED_EVERYWHERE : String(ownedStationId)}
                  onValueChange={(value) =>
                    void setOwnedPref(
                      value === OWNED_EVERYWHERE
                        ? { ...ownedPref, everywhere: true }
                        : { ...ownedPref, everywhere: false, stationId: Number(value) }
                    )
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-auto"
                    aria-label={t('market.appraisal.minusOwnedStation')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OWNED_EVERYWHERE}>
                      {t('market.appraisal.minusOwnedEverywhere')}
                    </SelectItem>
                    <SelectSeparator />
                    {TRADE_HUBS.map((h) => (
                      <SelectItem key={h.id} value={String(h.stationId)}>
                        {h.systemName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {lacksAssets && (
                <GrantNote
                  endpoints={ASSETS_ENDPOINTS}
                  title={t('market.appraisal.minusOwnedGrantTitle')}
                  hint={t('market.appraisal.minusOwnedGrantHint')}
                  actionLabel={t('market.appraisal.minusOwnedGrantAction')}
                />
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="md"
                variant="primary"
                className="max-sm:w-full"
                onClick={() => appraiseFromForm(controller.appraise)}
                disabled={!controller.canAppraise || loading}
              >
                {t('market.appraisal.appraise')}
              </Button>
              <Button size="md" onClick={controller.clear} disabled={text === ''}>
                {t('market.appraisal.clear')}
              </Button>
            </div>

            {unmatchedNote}
          </div>
        </Panel>
      )}

      <div className="flex flex-col gap-4">
        {summaryReady && result !== null && totals !== undefined && (
          // The summary groups, hold line and hub cards sit on the page ground; the
          // table below is the only Panel (DESIGN.md §6c, boxes in boxes).
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {minusOwned && (
                <span className="w-full text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {ownedPref.everywhere
                    ? t('market.appraisal.minusOwnedChipEverywhere')
                    : t('market.appraisal.minusOwnedChip', { station: ownedStation.systemName })}
                </span>
              )}
              <AppraisalHeaderStats
                totals={totals}
                net={net}
                itemCount={rows.length}
                showRefine={hasRefine}
                showCheapest={hasLpOption}
                implantBonusPct={implantBonusPct}
                pricesUnavailable={result.pricesUnreachable}
              />
              {loading && <Spinner label={t('common.loading')} size="sm" />}
            </div>

            {cargo !== null && (
              <AppraisalHoldBar
                totals={totals}
                cargo={cargo}
                characterId={characterId}
                onCargoChange={(next) => void setCargo(next)}
              />
            )}

            {net && (
              <AssumesBaseStandingsNote hint={t('market.appraisal.assumesBaseStandingsHint')} />
            )}

            {hasRefine && refinesOreOrIce && (
              <div className="empty:hidden">
                <ImplantsAssumedNote hint={t('market.appraisal.refineAssumesNoImplantsHint')} />
              </div>
            )}

            {!result.pricesUnreachable && totals.unpricedRows > 0 && (
              <p className="text-[0.6875rem] text-warning">
                {t('market.appraisal.unpriced', { count: totals.unpricedRows })}
              </p>
            )}
            {!result.pricesUnreachable && totals.refineUnpricedRows > 0 && (
              <p className="text-[0.6875rem] text-warning">
                {t('market.appraisal.refineUnpriced', { count: totals.refineUnpricedRows })}
              </p>
            )}
            {compare !== null && compareExpanded && <HubCompareCards rows={compare} />}
          </div>
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
              <>
                {compare !== null &&
                  (isPhone ? (
                    <IconButton
                      size="sm"
                      icon={<Icon.Compare />}
                      label={t('market.appraisal.compareHubsTitle')}
                      pressed={compareExpanded}
                      onClick={() => setCompareExpanded((open) => !open)}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-expanded={compareExpanded}
                      onClick={() => setCompareExpanded((open) => !open)}
                      className={textActionClassName('gap-1 normal-case')}
                    >
                      {t('market.appraisal.compareHubsTitle')}
                      {/* The cards open above the table, so open points up. */}
                      <Caret expanded={compareExpanded} opensUp />
                    </button>
                  ))}
                <ColumnPickerMenu
                  available={availableColumns}
                  visible={visibleColumns}
                  columnsById={optionalColumnsById}
                  onToggle={toggleColumn}
                  buttonLabel={t('market.appraisal.columnsButton')}
                  menuTitle={t('market.appraisal.columnsMenuTitle')}
                  size="sm"
                />
                <IconButton
                  size="sm"
                  icon={share.status === 'copied' ? <Icon.Done /> : <Icon.Share />}
                  label={t('market.appraisal.share')}
                  tooltip={
                    shareItemCount > MAX_SNAPSHOT_ITEMS
                      ? t('market.appraisal.shareTooLarge')
                      : share.status === 'saving'
                        ? t('market.appraisal.shareSaving')
                        : share.status === 'failed'
                          ? t('market.appraisal.shareFailed')
                          : share.status === 'copied'
                            ? t('market.appraisal.shareCopied')
                            : undefined
                  }
                  disabled={
                    characterId === null ||
                    !isSyncConfigured() ||
                    rows.length === 0 ||
                    shareItemCount > MAX_SNAPSHOT_ITEMS ||
                    share.status === 'saving'
                  }
                  onClick={() => void handleShare()}
                />
                {copied !== null && (
                  <span role="status" className="text-[0.6875rem] text-text-dim">
                    {t('market.appraisal.copied', {
                      list: t(`market.appraisal.copyList.${copied.list}`),
                      count: copied.count,
                    })}
                  </span>
                )}
                <TableActionsMenu
                  name={t('market.appraisal.resultTitle')}
                  tableExport={tableExport}
                >
                  {COPY_LISTS.map((list) => (
                    <MenuItem
                      key={list}
                      disabled={copyLists[list].count === 0}
                      onSelect={() => void handleCopy(list)}
                    >
                      {t(`market.appraisal.copyList.${list}`)}
                      {copyLists[list].count > 0 && (
                        <span className="ml-auto pl-3 text-text-dim">{copyLists[list].count}</span>
                      )}
                    </MenuItem>
                  ))}
                </TableActionsMenu>
              </>
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
                  <label
                    htmlFor="market-appraisal-share-url"
                    className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
                  >
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
