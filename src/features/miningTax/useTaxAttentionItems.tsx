import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { beginGrant } from '@/app/grantAction';
import { formatIsk } from '@/lib/isk';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';
import { claimKeyOf } from '@/features/miningTax/corpBook/useAutoClaimDonations';
import type { CorpBookView } from '@/features/miningTax/corpBook/corpBookView';
import { corpBookAttention } from '@/features/miningTax/corpBook/corpAttention';
import { corpPayAccounts, readsEveryDivision } from '@/features/miningTax/corpBook/corpPayAccount';
import {
  figureTarget,
  keptTarget,
  uncreditedTarget,
  type ResolveTarget,
} from '@/features/miningTax/corpBook/resolve/targets';
import { eveTimeLabel } from '@/engine/corpTaxBook/removalMail';
import {
  CorpDeclarationStatus,
  CorpDeclareAction,
} from '@/features/miningTax/corpBook/CorpDeclareAction';
import { canDeclare } from '@/engine/corpTaxBook/personal';
import { verifyPeriodLabel } from '@/features/corpTaxBook/verifyPeriodLabel';
import { systemLabel } from '@/features/miningTax/names';
import { pricesAtHubOnDate, sellFallbackAtHubOnDate } from '@/features/miningTax/pricing';
import { findPricingGaps } from '@/features/miningTax/pricingGaps';
import type { AttentionItem } from '@/features/miningTax/AttentionStrip';
import { tagAsIgnored, tagAsMoonOre } from '@/features/miningTax/typeOverrides';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import type { PayeeRecord } from '@/db';
import type { TradeHub } from '@/market/hubs';
import { duplicateRowToOpen } from './duplicateRowToOpen';
import { PricingGapLinks } from './PricingGapLinks';
import { UnpricedOreDetail } from './UnpricedOreDetail';
import { hasReachableUnpricedHub } from './unpricedHubs';
import { useClaimDonation } from './useClaimDonation';
import type { TaxSnapshot } from './taxSnapshot';

const NO_HUBS: ReadonlySet<TradeHub['id']> = new Set();

interface Args {
  data: TaxSnapshot | null;
  resolvedCharacterFilter: MultiSelectFilter<number>;
  personalRows: readonly DisplayRow[];
  /** Every row of the tab, the books' own included: an attention item opens one. */
  displayRows: readonly DisplayRow[];
  payeeById: ReadonlyMap<string, PayeeRecord>;
  corpView: CorpBookView | null;
  failedClaims: ReadonlySet<string>;
  reloadCorpBooks: () => void;
  systemName: (dr: DisplayRow) => string;
  systemNames: ReadonlyMap<number, string>;
  refresh: () => void;
  openDetail: (dr: DisplayRow) => void;
  /** Opens a row with the "unassign this?" question already asked — the duplicate's one-click fix. */
  openUnassign: (dr: DisplayRow) => void;
  /**
   * The Resolve dialog (resolving in the app): opens it on a problem, and the member's own
   * "Not paying" set, whose problems the strip leaves out — they are listed on the quiet line.
   */
  resolve: { open: (target: ResolveTarget) => void; hidden: ReadonlySet<string> };
}

/** What needs the pilot's attention above the ledger: lapsed logins, missing prices, duplicates, unclaimed donations, unclassified ore. */
export function useTaxAttentionItems({
  data,
  resolvedCharacterFilter,
  personalRows,
  displayRows,
  payeeById,
  corpView,
  failedClaims,
  reloadCorpBooks,
  systemName,
  systemNames,
  refresh,
  openDetail,
  openUnassign,
  resolve,
}: Args): AttentionItem[] {
  const { t, i18n } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const { claiming, claimError, handleClaim } = useClaimDonation(reloadCorpBooks);

  // Which entries the pricing banner is about, so it can link to them — the
  // table only shows an entry's total, never per-ore prices.
  const pricingGaps = useMemo(() => {
    if (!data) return [];
    return findPricingGaps(personalRows, {
      hubIdOf: (assignment) => payeeById.get(assignment?.payeeId ?? '')?.hubId,
      pricesAt: (hubId, date) => pricesAtHubOnDate(data.datedPrices, hubId, date),
      sellFallbackAt: (hubId, date) => sellFallbackAtHubOnDate(data.datedPrices, hubId, date),
    });
  }, [data, personalRows, payeeById]);

  async function handleTagAsMoonOre(typeId: number) {
    await tagAsMoonOre(typeId);
    refresh();
  }

  async function handleTagAsIgnored(typeId: number) {
    await tagAsIgnored(typeId);
    refresh();
  }

  // What a Corp Tax Book says that the tab alone would not (#6204), for the Characters in view —
  // an item about a filtered-out alt would have no row to open.
  const corp = useMemo(
    () => corpBookAttention(corpView, resolvedCharacterFilter),
    [corpView, resolvedCharacterFilter]
  );

  const duplicateRows =
    data?.entries.filter((row) => (row.duplicateAssignmentIds?.length ?? 0) > 0) ?? [];

  const attentionItems: AttentionItem[] = [];
  if (!data) return attentionItems;

  // Per-character re-login, never one flag hiding every other character's
  // data behind a full-page banner — a lapsed alt must stay visible as
  // needing attention, not disappear. Only for the Characters in view: the
  // all-Characters view names every one, a narrowed view only its own.
  for (const c of data.reauthCharacters.filter(
    (c) => resolvedCharacterFilter === 'all' || resolvedCharacterFilter.has(c.characterId)
  )) {
    attentionItems.push({
      id: `reauth:${c.characterId}`,
      tone: 'warning',
      title: t('miningTax.reauthCharacterHint', { character: c.characterName }),
      action: (
        <NeedsConnection>
          <Button size="sm" onClick={() => void beginGrant(c.characterId, ['getCharacterMining'])}>
            {t('miningTax.reauthAction')}
          </Button>
        </NeedsConnection>
      ),
    });
  }
  const gapLinks = (
    gaps: typeof pricingGaps,
    pick: (gap: (typeof pricingGaps)[number]) => number[]
  ) => (
    <PricingGapLinks
      gaps={gaps}
      pick={pick}
      typeNames={data.typeNames}
      systemName={systemName}
      onOpen={openDetail}
    />
  );
  // An ore type the hub quoted no buy order for is valued at 0, which
  // renders exactly like a cheap ore and silently understates the bill.
  // Named per hub rather than pooled: "no buy orders" is a fact about one
  // order book, and once two Payees bill at two hubs, blaming both for one
  // thin book would be wrong. A hub whose price source could not be reached
  // (offline) is a different fact again; `UnpricedOreDetail` decides per hub.
  if (data.unpricedTypeIds.size > 0) {
    const unreachableHubs = data.datedPrices.unreachableHubs ?? NO_HUBS;
    attentionItems.push({
      id: 'unpriced',
      tone: 'warning',
      title: hasReachableUnpricedHub(data.unpricedByHub, unreachableHubs)
        ? t('miningTax.unpricedTitle')
        : pricesUnavailableLabel,
      detail: (
        <UnpricedOreDetail
          unpricedByHub={data.unpricedByHub}
          unreachableHubs={unreachableHubs}
          typeNames={data.typeNames}
        >
          {gapLinks(
            pricingGaps.filter((g) => g.unpriced.length > 0),
            (g) => g.unpriced
          )}
        </UnpricedOreDetail>
      ),
    });
  }
  if (pricingGaps.some((g) => g.sellFallback.length > 0)) {
    attentionItems.push({
      id: 'sell-fallback',
      tone: 'info',
      title: t('miningTax.sellFallbackTitle'),
      detail: (
        <>
          <p>{t('miningTax.sellFallbackHint')}</p>
          {gapLinks(
            pricingGaps.filter((g) => g.sellFallback.length > 0),
            (g) => g.sellFallback
          )}
        </>
      ),
    });
  }
  if (duplicateRows.length > 0) {
    // The copy used to say "open the day and Unassign the extra one" over a list of plain text,
    // leaving the member to find the row themselves. Each day now opens straight on the
    // "unassign this?" question, which still shows what it removes before anything goes.
    attentionItems.push({
      id: 'duplicates',
      tone: 'warning',
      title: t('miningTax.duplicateTitle'),
      detail: (
        <>
          <p>{t('miningTax.duplicateHint')}</p>
          <ul className="space-y-0.5">
            {duplicateRows.map((row) => {
              const label = `${row.characterName} — ${row.entry.date} — ${systemLabel(
                systemNames,
                row.entry.solarSystemId
              )}`;
              const extra = duplicateRowToOpen(row.duplicateAssignmentIds, displayRows);
              return (
                <li key={`${row.characterId}:${row.entry.date}:${row.entry.solarSystemId}`}>
                  {extra ? (
                    <button
                      type="button"
                      className={`text-left ${inlineLinkClassName}`}
                      aria-label={t('miningTax.duplicateOpen', { entry: label })}
                      onClick={() => openUnassign(extra)}
                    >
                      {label}
                    </button>
                  ) : (
                    label
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ),
    });
  }
  // A claim the automatic pass could not make (offline, say): the donor retries it by hand.
  for (const claim of corpView?.claims ?? []) {
    const claimKey = claimKeyOf(claim.corporationId, claim.payment.id);
    if (!failedClaims.has(claimKey)) continue;
    attentionItems.push({
      id: `corp-claim:${claimKey}`,
      tone: 'info',
      title: t('miningTax.corpBook.claim.title', { corp: claim.corpName }),
      detail: (
        <p>
          {t('miningTax.corpBook.claim.detail', {
            amount: formatIsk(claim.payment.amount, 0),
            date: claim.payment.at.slice(0, 10),
            character: claim.characterName,
            corp: claim.corpName,
          })}
          {claimError === claimKey && ` ${t('miningTax.corpBook.claim.failed')}`}
        </p>
      ),
      action: (
        <NeedsConnection>
          <Button
            size="sm"
            disabled={claiming !== null}
            onClick={() =>
              void handleClaim(
                claim.payment.characterId,
                claim.corporationId,
                claim.payment.id,
                claimKey
              )
            }
          >
            {t('miningTax.corpBook.claim.action')}
          </Button>
        </NeedsConnection>
      ),
    });
  }
  for (const o of corp.overdue) {
    attentionItems.push({
      id: `corp-overdue:${o.corporationId}:${o.statementId}`,
      tone: 'warning',
      title: t('miningTax.corpBook.attention.overdueTitle', {
        corp: o.corpName,
        period: verifyPeriodLabel(o.periodStart, o.periodEnd, i18n.language),
        date: o.overdueAt.slice(0, 10),
      }),
      detail: (
        <>
          <p>{t('miningTax.corpBook.attention.overdueDetail', { code: o.code })}</p>
          {o.declaration && (
            <CorpDeclarationStatus declaration={o.declaration} corpName={o.corpName} />
          )}
        </>
      ),
      // #6206: the member says they paid it another way; the corporation's officers answer it.
      ...(canDeclare(o.declaration) && o.declarerId !== undefined
        ? {
            action: (
              <CorpDeclareAction
                corporationId={o.corporationId}
                corpName={o.corpName}
                statementId={o.statementId}
                characterId={o.declarerId}
                onDeclared={reloadCorpBooks}
              />
            ),
          }
        : {}),
    });
  }
  // One item per book, not per donation: a second uncredited donation to the same corporation
  // needs the same sync and the same dispute, so repeating the whole advisory only pushed the
  // ledger further down the page — which is what folding the old stacked banners into one strip
  // set out to stop (20261004-135551-mining-tax-redesign-owed-first-combined-entries-edit).
  const uncreditedByCorp = new Map<number, typeof corp.uncredited>();
  for (const u of corp.uncredited) {
    const group = uncreditedByCorp.get(u.corporationId);
    if (group) group.push(u);
    else uncreditedByCorp.set(u.corporationId, [u]);
  }
  for (const [corporationId, group] of uncreditedByCorp) {
    const loaded = corpView?.books.find((b) => b.loaded.corporationId === corporationId)?.loaded;
    const divisions = loaded?.divisions ?? [];
    const accounts = corpPayAccounts(divisions, loaded?.divisionNames, t).join(', ');
    // With every division read, the ISK can't be in an unread one: a sync is due, or it never came.
    const every = readsEveryDivision(divisions);
    const corpName = group[0].corpName;
    const only = group.length === 1 ? group[0] : undefined;
    const total = group.reduce((sum, u) => sum + u.amount, 0);
    // Every way out of it in one dialog: pay again, not paying, or send the proof — the
    // transfers with their journal refs, checked against the corporation's wallet first.
    const target = uncreditedTarget(group, corpView?.overlay.rows ?? []);
    if (resolve.hidden.has(target.hideKey)) continue;
    attentionItems.push({
      id: `corp-uncredited:${corporationId}`,
      tone: 'warning',
      action: (
        <Button size="sm" onClick={() => resolve.open(target)}>
          {t('miningTax.resolve.open')}
        </Button>
      ),
      title: only
        ? t(
            every
              ? 'miningTax.corpBook.attention.uncreditedEveryTitle'
              : 'miningTax.corpBook.attention.uncreditedTitle',
            { corp: corpName, amount: formatIsk(only.amount, 0), date: only.at.slice(0, 10) }
          )
        : t(
            every
              ? 'miningTax.corpBook.attention.uncreditedEveryTitleMany'
              : 'miningTax.corpBook.attention.uncreditedTitleMany',
            { corp: corpName, n: group.length, amount: formatIsk(total, 0) }
          ),
      detail: (
        <>
          <p>
            {every
              ? t('miningTax.corpBook.attention.uncreditedEveryDetail', { corp: corpName })
              : t('miningTax.corpBook.attention.uncreditedDetail', { corp: corpName, accounts })}
          </p>
          {/* What the member needs to dispute it: the days it paid, and the transfer itself. */}
          {only ? (
            <>
              {only.covered.length > 0 && (
                <p>
                  {t('miningTax.corpBook.attention.uncreditedCovered', {
                    days: only.covered.join(', '),
                  })}
                </p>
              )}
              <p>
                {t('miningTax.corpBook.attention.uncreditedDispute', {
                  corp: corpName,
                  amount: formatIsk(only.amount, 0),
                  time: eveTimeLabel(Date.parse(only.at)),
                })}
                {only.refId !== undefined &&
                  ` ${t('miningTax.corpBook.attention.uncreditedRef', { ref: only.refId })}`}
              </p>
            </>
          ) : (
            <>
              <p>{t('miningTax.corpBook.attention.uncreditedDisputeMany', { corp: corpName })}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {group.map((u) => (
                  <li key={`${u.characterId}:${u.at}`}>
                    {t('miningTax.corpBook.attention.uncreditedItem', {
                      amount: formatIsk(u.amount, 0),
                      time: eveTimeLabel(Date.parse(u.at)),
                    })}
                    {u.refId !== undefined &&
                      ` ${t('miningTax.corpBook.attention.uncreditedRef', { ref: u.refId })}`}
                    {u.covered.length > 0 &&
                      ` — ${t('miningTax.corpBook.attention.uncreditedItemCovered', {
                        days: u.covered.join(', '),
                      })}`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ),
    });
  }
  // A billed day whose figures differ from the member's own record: it used to be said only
  // inside Compare with the book, with no way to act on it. And a day an officer kept the bill
  // on, with what they said to do next. Each once per day, for the Characters in view.
  const inView = (id: number) =>
    resolvedCharacterFilter === 'all' || resolvedCharacterFilter.has(id);
  const seenDays = new Set<string>();
  for (const row of corpView?.overlay.rows ?? []) {
    if (!inView(row.characterId)) continue;
    const kept = row.flagged?.state === 'rejected';
    const figure = row.state === 'billed' && row.dispute !== undefined && row.flagged === undefined;
    if (!kept && !figure) continue;
    const target = kept ? keptTarget(row) : figureTarget(row);
    if (resolve.hidden.has(target.hideKey) || seenDays.has(target.hideKey)) continue;
    seenDays.add(target.hideKey);
    attentionItems.push({
      id: `corp-${kept ? 'kept' : 'figure'}:${target.hideKey}`,
      tone: 'warning',
      title: kept
        ? t('miningTax.resolve.strip.kept', { corp: row.corpName, date: row.date })
        : row.dispute?.rate
          ? t('miningTax.resolve.strip.rate', {
              corp: row.corpName,
              date: row.date,
              book: row.dispute.bookPct,
              yours: row.dispute.personalPct ?? '?',
            })
          : t('miningTax.resolve.strip.quantity', { corp: row.corpName, date: row.date }),
      detail: kept ? (
        <>
          {row.flagged?.reason && <p>{row.flagged.reason}</p>}
          {row.flagged?.nextStep && (
            <p className="font-semibold text-text">
              {t('miningTax.resolve.facts.nextStep', { step: row.flagged.nextStep })}
            </p>
          )}
        </>
      ) : (
        <p>{t('miningTax.resolve.strip.figureDetail', { amount: formatIsk(row.billed, 0) })}</p>
      ),
      action: (
        <Button size="sm" onClick={() => resolve.open(target)}>
          {t('miningTax.resolve.open')}
        </Button>
      ),
    });
  }
  for (const a of corp.alsoBilled) {
    const payees = a.payeeIds
      .map((id) => payeeById.get(id)?.name ?? t('miningTax.unknownPayee'))
      .join(', ');
    const target = displayRows.find((dr) => dr.key === a.rowId);
    attentionItems.push({
      id: `corp-also-billed:${a.corporationId}`,
      tone: 'warning',
      title: t('miningTax.corpBook.attention.alsoBilledTitle', { corp: a.corpName, payees }),
      detail: (
        <p>
          {t('miningTax.corpBook.attention.alsoBilledDetail', {
            payees,
            action: t('miningTax.corpBook.overlap.letBill'),
          })}
        </p>
      ),
      ...(target && {
        action: (
          <Button size="sm" onClick={() => openDetail(target)}>
            {t('miningTax.corpBook.attention.openDay')}
          </Button>
        ),
      }),
    });
  }
  for (const u of data.unclassified) {
    for (const typeId of u.typeIds) {
      attentionItems.push({
        id: `unclassified:${u.characterId}:${typeId}`,
        tone: 'warning',
        title: t('miningTax.attention.unclassifiedOre', {
          character: u.characterName,
          ore: data.typeNames.get(typeId) ?? `#${typeId}`,
        }),
        detail: <p>{t('miningTax.unclassifiedHint')}</p>,
        action: (
          <>
            <Button size="sm" onClick={() => void handleTagAsMoonOre(typeId)}>
              {t('miningTax.tagAsMoonOre')}
            </Button>
            <Button size="sm" onClick={() => void handleTagAsIgnored(typeId)}>
              {t('miningTax.ignoreOreAction')}
            </Button>
          </>
        ),
      });
    }
  }
  return attentionItems;
}
