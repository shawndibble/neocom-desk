import { useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  NativeSelect,
  PageHeader,
  Panel,
  ReauthBanner,
  Spinner,
  Tabs,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadWalletBalanceWithStatus, loadWalletJournal } from '@/features/character/wallet';
import { loadCharacterLoyaltyPoints, splitEverMarks } from '@/features/character/loyalty';
import { resolveNames } from '@/features/character/names';
import type { CachedResult, StatusResult } from '@/esi/cache';
import { humanizeRefType, iskToneClass } from '@/features/character/format';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useCorpOwner } from '@/features/corp/owner';
import { OwnerSwitch } from '@/features/corp/OwnerSwitch';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { walletDivisions, type WalletDivision } from '@/features/corp/divisions';
import {
  loadCorporationDivisions,
  loadCorporationWalletJournal,
  loadCorporationWallets,
} from '@/features/corp/wallet';
import { formatIsk } from '@/lib/isk';
import { downloadCsv } from '@/lib/downloadCsv';
import { walletJournalCsvColumns } from '@/features/character/walletJournalCsv';
import type {
  CharacterLoyaltyPoints,
  CorporationDivisions,
  CorporationWalletDivision,
  WalletJournalEntry,
} from '@/esi/endpoints';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();

interface Snapshot {
  balanceResult: CachedResult<number> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  balanceNeedsReauth: boolean;
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  journalTruncated: boolean;
  loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  loyaltyNeedsReauth: boolean;
  corporationNames: Map<number, string>;
}

async function loadWalletSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [balanceStatus, journalResult, loyaltyStatus] = await Promise.all([
    loadWalletBalanceWithStatus(characterId),
    loadWalletJournal(characterId),
    loadCharacterLoyaltyPoints(characterId),
  ]);
  const { cached: balanceResult, needsReauth: balanceNeedsReauth } = balanceStatus;
  const { cached: loyaltyResult, needsReauth: loyaltyNeedsReauth } = loyaltyStatus;
  const journalTruncated = journalResult?.truncated ?? false;
  // Already superseded: skip the ESI name resolve, its result would be discarded.
  const corporationIds = signal.cancelled
    ? []
    : (loyaltyResult?.data ?? []).map((entry) => entry.corporation_id);
  const corporationNames = await resolveNames(corporationIds);
  return {
    balanceResult,
    balanceNeedsReauth,
    journalResult,
    journalTruncated,
    loyaltyResult,
    loyaltyNeedsReauth,
    corporationNames,
  };
}

/** Balances and the division names, which need two separate reads and two separate scopes. */
interface CorpBalancesSnapshot {
  walletsResult: StatusResult<CorporationWalletDivision[]>;
  divisionsResult: StatusResult<CorporationDivisions>;
}

async function loadCorpBalances(
  characterId: number,
  corporationId: number
): Promise<CorpBalancesSnapshot> {
  const [walletsResult, divisionsResult] = await Promise.all([
    loadCorporationWallets(characterId, corporationId),
    loadCorporationDivisions(characterId, corporationId),
  ]);
  return { walletsResult, divisionsResult };
}

interface CorpWalletViewProps {
  tab: 'balance' | 'journal';
  balances: CorpBalancesSnapshot | null;
  balancesLoading: boolean;
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  journal: WalletJournalEntry[];
  journalLoading: boolean;
  /** The page's own journal columns — the corp journal is the same table, not a second one. */
  journalColumns: DataTableColumn<WalletJournalEntry>[];
  division: WalletDivision | null;
  divisionLabel: (entry: WalletDivision) => string;
  offlineTitleKey: string;
}

/**
 * The corporation side of the page: one division's balance and its journal.
 *
 * Reuses the page's own journal columns rather than declaring its own — ESI
 * returns the same schema for both journals, which is the whole reason this
 * direction works. There is no loyalty panel (that is a Character's own); nor
 * a Transactions tab (Market's own now — personal-only, see TransactionsPanel).
 */
function CorpWalletView({
  tab,
  balances,
  balancesLoading,
  journalResult,
  journal,
  journalLoading,
  journalColumns,
  division,
  divisionLabel,
  offlineTitleKey,
}: CorpWalletViewProps) {
  const { t } = useTranslation();

  if (tab === 'balance') {
    const walletsResult = balances?.walletsResult.cached ?? null;
    return (
      <Panel
        title={t('wallet.balanceTab')}
        actions={walletsResult ? <DataAgeBadge date={walletsResult.fetchedAt} /> : undefined}
      >
        {balancesLoading ? (
          <div className="flex justify-center py-8">
            <Spinner label={t('common.loading')} />
          </div>
        ) : !walletsResult || division === null ? (
          <EmptyState title={t('wallet.corpBalanceEmpty')} className="py-4" />
        ) : (
          <>
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {divisionLabel(division)}
            </p>
            <p className={`text-lg font-medium tabular-nums ${iskToneClass(division.balance)}`}>
              {formatIsk(division.balance, 2)}
            </p>
            {walletsResult.fromCache && (
              <p className="mt-3 text-[0.6875rem] text-warning uppercase">{t(offlineTitleKey)}</p>
            )}
          </>
        )}
      </Panel>
    );
  }

  return (
    <Panel
      padded={false}
      title={t('wallet.journalTab')}
      actions={
        journalResult ? (
          <span className="flex items-center gap-2">
            <IconButton
              size="sm"
              icon={<Icon.Download />}
              label={t('wallet.exportCsvJournal')}
              disabled={journal.length === 0}
              onClick={() =>
                downloadCsv(
                  'corp-wallet-journal',
                  journal,
                  walletJournalCsvColumns(t),
                  new Date(),
                  journalResult.truncated
                )
              }
            />
            <DataAgeBadge date={journalResult.fetchedAt} />
          </span>
        ) : undefined
      }
    >
      {journalLoading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : !journalResult || journal.length === 0 ? (
        <EmptyState
          title={t('wallet.corpJournalEmptyTitle')}
          hint={t('wallet.corpJournalEmptyHint')}
          className="py-8"
        />
      ) : (
        <>
          {journalResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t(offlineTitleKey)}
            </p>
          )}
          {journalResult.truncated && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')}
            </p>
          )}
          <DataTable
            label={t('wallet.journalTab')}
            columns={journalColumns}
            rows={journal}
            rowKey={(entry) => entry.id}
          />
        </>
      )}
    </Panel>
  );
}

/** Parses the `?tab=` deep link; anything unrecognized lands on Balance rather than erroring. */
function walletTabFromParam(param: string | null): 'balance' | 'journal' {
  return param === 'journal' ? 'journal' : 'balance';
}

/**
 * Wallet: ISK balance and journal. Read-only, cached for offline. Recent
 * transactions moved to Market's own Transactions tab.
 *
 * For a Character holding the corp wallet capability the same page also shows
 * the corporation's wallet, one division at a time (issue #298) — the same
 * journal table under a different owner, with a division selector beside the
 * switch. For everyone else the switch does not render and this page is exactly
 * what it was (CONTEXT.md round 35).
 */
export function Wallet() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refreshCount, refresh } =
    useRouteSnapshot(loadWalletSnapshot);

  // A notification's `?tab=` deep link (`notificationOptions.ts`) picks the
  // opening tab; read once on mount, same as the `Tabs` control's own local
  // state below — an invalid or missing value falls back to Balance.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<'balance' | 'journal'>(() =>
    walletTabFromParam(searchParams.get('tab'))
  );

  const {
    owner,
    setOwner,
    available: corpAvailable,
    corporationId,
  } = useCorpOwner('canReadWallet');
  const showingCorp =
    owner === 'corporation' && corporationId !== null && activeCharacterId !== null;

  // Nothing is fetched until the switch is flipped; the key carries the
  // corporation, so a corp change resets rather than relabelling its rows.
  const corpBalances = useCorpSnapshot<CorpBalancesSnapshot | null>(
    showingCorp ? `${activeCharacterId}:${corporationId}` : null,
    async () =>
      activeCharacterId === null || corporationId === null
        ? null
        : loadCorpBalances(activeCharacterId, corporationId)
  );

  const divisions = useMemo<WalletDivision[]>(
    () =>
      walletDivisions(
        corpBalances.data?.walletsResult.cached?.data ?? [],
        corpBalances.data?.divisionsResult.cached?.data ?? null
      ),
    [corpBalances.data]
  );

  // Derived, not effect-synced, the same way Industry picks its selected plan:
  // falls back to the first division whenever the chosen one isn't in this
  // corporation's list — which is exactly what a corp change looks like.
  const [division, setDivision] = useState(1);
  const effectiveDivision = divisions.some((entry) => entry.division === division)
    ? division
    : (divisions[0]?.division ?? division);
  const selectedDivision = divisions.find((entry) => entry.division === effectiveDivision) ?? null;

  // Its own key, division included: ESI publishes no all-divisions journal and
  // each division caches separately (features/corp/wallet.ts). Gated on the tab
  // as well, so opening the corp side on Balance doesn't page a whole journal
  // nobody asked to see.
  const corpJournal = useCorpSnapshot<StatusResult<WalletJournalEntry[]> | null>(
    showingCorp && tab === 'journal'
      ? `${activeCharacterId}:${corporationId}:${effectiveDivision}`
      : null,
    async () =>
      activeCharacterId === null || corporationId === null
        ? null
        : loadCorporationWalletJournal(activeCharacterId, corporationId, effectiveDivision)
  );

  const divisionLabel = (entry: WalletDivision) =>
    entry.name ?? t('wallet.corpDivisionFallback', { division: entry.division });

  /** One Refresh button, so it reloads whichever corp reads this page is showing. */
  const handleCorpRefresh = () => {
    corpBalances.refresh();
    corpJournal.refresh();
  };

  // A manual Refresh that still falls back to cache is a more alarming case
  // than the initial load finding cache first — same banner, different copy.
  const offlineTitleKey = refreshCount > 0 ? 'common.refreshFailedTitle' : 'common.offlineTitle';

  const balanceResult = data?.balanceResult ?? null;
  const balanceNeedsReauth = data?.balanceNeedsReauth ?? false;
  const journalResult = data?.journalResult ?? null;
  const journalTruncated = data?.journalTruncated ?? false;
  const loyaltyResult = data?.loyaltyResult ?? null;
  const loyaltyNeedsReauth = data?.loyaltyNeedsReauth ?? false;
  const corporationNames = data?.corporationNames ?? NO_NAMES;

  const { everMarks, otherLoyalty } = useMemo(
    () => splitEverMarks(loyaltyResult?.data ?? []),
    [loyaltyResult]
  );

  const loyaltyColumns = useMemo<DataTableColumn<CharacterLoyaltyPoints>[]>(
    () => [
      {
        id: 'corporation',
        header: t('loyalty.corporation'),
        render: (entry) => corporationNames.get(entry.corporation_id) ?? `#${entry.corporation_id}`,
        sortValue: (entry) =>
          corporationNames.get(entry.corporation_id) ?? `#${entry.corporation_id}`,
      },
      {
        id: 'points',
        header: t('loyalty.points'),
        align: 'right',
        className: 'tabular-nums font-semibold',
        render: (entry) => entry.loyalty_points.toLocaleString(),
        sortValue: (entry) => entry.loyalty_points,
      },
    ],
    [t, corporationNames]
  );

  const journalColumns = useMemo<DataTableColumn<WalletJournalEntry>[]>(
    () => [
      {
        id: 'date',
        header: t('wallet.date'),
        className: 'whitespace-nowrap text-text-dim',
        render: (entry) => new Date(entry.date).toLocaleString(),
      },
      {
        id: 'refType',
        header: t('wallet.refType'),
        className: 'whitespace-nowrap',
        // Titles the card on a phone: "Bounty prizes" identifies the entry,
        // where the date column it follows would not.
        primary: true,
        render: (entry) => humanizeRefType(entry.ref_type),
      },
      {
        id: 'description',
        header: t('wallet.description'),
        render: (entry) => entry.description,
      },
      {
        id: 'amount',
        header: t('wallet.amount'),
        align: 'right',
        className: 'tabular-nums',
        cellClassName: (entry) => (entry.amount !== undefined ? iskToneClass(entry.amount) : ''),
        render: (entry) =>
          entry.amount !== undefined ? formatIsk(entry.amount, 2) : t('common.unknown'),
      },
      {
        id: 'balance',
        header: t('wallet.balanceCol'),
        align: 'right',
        className: 'tabular-nums text-text-dim',
        render: (entry) =>
          entry.balance !== undefined ? formatIsk(entry.balance, 2) : t('common.unknown'),
      },
    ],
    [t]
  );

  const journal = useMemo(
    () => [...(journalResult?.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [journalResult]
  );

  const corpJournalResult = corpJournal.data?.cached ?? null;
  const corpJournalEntries = useMemo(
    () => [...(corpJournalResult?.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [corpJournalResult]
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('wallet.title')}
        actions={
          <>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('wallet.refresh')}
              onClick={showingCorp ? handleCorpRefresh : refresh}
              disabled={showingCorp ? corpBalances.loading || corpJournal.loading : loading}
            />
          </>
        }
      />

      {/*
        The switch and, beside it, the division selector — one wrapping row, so
        a phone stacks them rather than scrolling the page sideways. Rendered
        only for a Character that actually holds the capability; for everyone
        else this is not on the page at all.
      */}
      {corpAvailable && (
        <div className="flex flex-wrap items-center gap-2">
          <OwnerSwitch
            value={owner}
            onChange={setOwner}
            label={t('wallet.ownerLabel')}
            personalLabel={t('wallet.ownerPersonal')}
            corporationLabel={t('wallet.ownerCorporation')}
          />
          {showingCorp && divisions.length > 0 && (
            <NativeSelect
              size="sm"
              className="w-56"
              aria-label={t('wallet.corpDivisionLabel')}
              value={effectiveDivision}
              onChange={(event) => setDivision(Number(event.target.value))}
            >
              {divisions.map((entry) => (
                <option key={entry.division} value={entry.division}>
                  {divisionLabel(entry)}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
      )}

      <Tabs
        label={t('wallet.title')}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'balance', label: t('wallet.balanceTab') },
          { id: 'journal', label: t('wallet.journalTab') },
        ]}
      />

      {showingCorp ? (
        <CorpWalletView
          tab={tab}
          balances={corpBalances.data}
          balancesLoading={corpBalances.loading}
          journalResult={corpJournalResult}
          journal={corpJournalEntries}
          journalLoading={corpJournal.loading}
          journalColumns={journalColumns}
          division={selectedDivision}
          divisionLabel={divisionLabel}
          offlineTitleKey={
            corpBalances.refreshCount > 0 || corpJournal.refreshCount > 0
              ? 'common.refreshFailedTitle'
              : 'common.offlineTitle'
          }
        />
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : tab === 'balance' ? (
        <div className="space-y-4">
          <Panel
            title={t('wallet.balanceTab')}
            actions={balanceResult ? <DataAgeBadge date={balanceResult.fetchedAt} /> : undefined}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('wallet.isk')}
                </p>
                {balanceNeedsReauth ? (
                  <ReauthBanner
                    title={t('wallet.reauthTitle')}
                    hint={t('wallet.reauthHint')}
                    actionLabel={t('wallet.reauthAction')}
                    onLogin={() => void beginEveLogin()}
                  />
                ) : balanceResult ? (
                  <p
                    className={`text-lg font-medium tabular-nums ${iskToneClass(balanceResult.data)}`}
                  >
                    {formatIsk(balanceResult.data, 2)}
                  </p>
                ) : (
                  <EmptyState title={t('wallet.balanceEmpty')} className="py-4" />
                )}
              </div>
              <div>
                <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('wallet.everMarks')}
                </p>
                <p className="text-lg font-medium tabular-nums">
                  {loyaltyResult && !loyaltyNeedsReauth
                    ? everMarks.toLocaleString()
                    : t('common.unknown')}
                </p>
              </div>
            </div>
            {(balanceResult?.fromCache || loyaltyResult?.fromCache) && (
              <p className="mt-3 text-[0.6875rem] text-warning uppercase">{t(offlineTitleKey)}</p>
            )}
          </Panel>

          <Panel
            padded={false}
            title={t('loyalty.title')}
            actions={loyaltyResult ? <DataAgeBadge date={loyaltyResult.fetchedAt} /> : undefined}
          >
            {loyaltyNeedsReauth ? (
              <div className="p-3">
                <ReauthBanner
                  title={t('loyalty.reauthTitle')}
                  hint={t('loyalty.reauthHint')}
                  actionLabel={t('loyalty.reauthAction')}
                  onLogin={() => void beginEveLogin()}
                />
              </div>
            ) : !loyaltyResult || otherLoyalty.length === 0 ? (
              <EmptyState
                title={t('loyalty.emptyTitle')}
                hint={t('loyalty.emptyHint')}
                className="py-8"
              />
            ) : (
              <DataTable
                label={t('loyalty.title')}
                columns={loyaltyColumns}
                rows={otherLoyalty}
                rowKey={(entry) => entry.corporation_id}
                defaultSort={{ columnId: 'points', direction: 'desc' }}
              />
            )}
          </Panel>
        </div>
      ) : (
        <Panel
          padded={false}
          title={t('wallet.journalTab')}
          actions={
            journalResult ? (
              <span className="flex items-center gap-2">
                <IconButton
                  size="sm"
                  icon={<Icon.Download />}
                  label={t('wallet.exportCsvJournal')}
                  disabled={journal.length === 0}
                  onClick={() =>
                    downloadCsv(
                      'wallet-journal',
                      journal,
                      walletJournalCsvColumns(t),
                      new Date(),
                      journalTruncated
                    )
                  }
                />
                <DataAgeBadge date={journalResult.fetchedAt} />
              </span>
            ) : undefined
          }
        >
          {!journalResult || journal.length === 0 ? (
            <EmptyState
              title={t('wallet.journalEmptyTitle')}
              hint={t('wallet.journalEmptyHint')}
              className="py-8"
            />
          ) : (
            <>
              {journalResult.fromCache && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t(offlineTitleKey)}
                </p>
              )}
              {journalTruncated && (
                <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                  {t('common.incompleteTitle')}
                </p>
              )}
              <DataTable
                label={t('wallet.journalTab')}
                columns={journalColumns}
                rows={journal}
                rowKey={(entry) => entry.id}
              />
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
