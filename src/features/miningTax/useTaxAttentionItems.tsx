import { utcDayOf } from '../../../functions/src/timeConstants';
import { useMemo } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { dateTimeAt } from '@/features/corp/moons/moonsFormat';
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
  figureNeedsAnswer,
  figureTarget,
  inReviewTarget,
  keptBy,
  keptTarget,
  overdueTarget,
  uncreditedTarget,
  type ResolveTarget,
} from '@/features/miningTax/corpBook/resolve/targets';
import { CorpDeclarationStatus } from '@/features/miningTax/corpBook/CorpDeclareAction';
import { canDeclare } from '@/engine/corpTaxBook/personal';
import { systemLabel } from '@/features/miningTax/names';
import { pricesAtHubOnDate, sellFallbackAtHubOnDate } from '@/features/miningTax/pricing';
import { findPricingGaps } from '@/features/miningTax/pricingGaps';
import type { AttentionItem } from '@/features/miningTax/AttentionStrip';
import { tagAsIgnored, tagAsMoonOre } from '@/features/miningTax/typeOverrides';
import { formatDateRange, type DisplayRow } from '@/features/miningTax/groupRows';
import type { PayeeRecord } from '@/db';
import type { TradeHub } from '@/market/hubs';
import { duplicateRowToOpen } from './duplicateRowToOpen';
import { PricingGapLinks } from './PricingGapLinks';
import { UnpricedOreDetail } from './UnpricedOreDetail';
import { hasReachableUnpricedHub } from './unpricedHubs';
import { useClaimDonation } from './useClaimDonation';
import type { TaxSnapshot } from './taxSnapshot';
import { unlinkedPayeesItem } from './unlinkedPayeesAttention';

const NO_HUBS: ReadonlySet<TradeHub['id']> = new Set();

interface Args {
  data: TaxSnapshot | null;
  resolvedCharacterFilter: MultiSelectFilter<number>;
  personalRows: readonly DisplayRow[];
  displayRows: readonly DisplayRow[];
  payeeById: ReadonlyMap<string, PayeeRecord>;
  unlinkedPayees: readonly PayeeRecord[];
  openPayeeManager: () => void;
  corpView: CorpBookView | null;
  failedClaims: ReadonlySet<string>;
  reloadCorpBooks: () => void;
  systemName: (dr: DisplayRow) => string;
  systemNames: ReadonlyMap<number, string>;
  refresh: () => void;
  openDetail: (dr: DisplayRow) => void;
  openUnassign: (dr: DisplayRow) => void;
  resolve: {
    open: (target: ResolveTarget) => void;
    hidden: ReadonlySet<string>;
    hide: (key: string) => void;
  };
}

export function useTaxAttentionItems({
  data,
  resolvedCharacterFilter,
  personalRows,
  displayRows,
  payeeById,
  unlinkedPayees,
  openPayeeManager,
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
  const zone = useTimeZone();
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const { claiming, claimError, handleClaim } = useClaimDonation(reloadCorpBooks);

  const resolveActions = (target: ResolveTarget) => (
    <>
      <Button size="sm" onClick={() => resolve.open(target)}>
        {t('miningTax.resolve.open')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void resolve.hide(target.hideKey)}>
        {t('miningTax.resolve.notPayingAction')}
      </Button>
    </>
  );

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

  const corp = useMemo(
    () => corpBookAttention(corpView, resolvedCharacterFilter),
    [corpView, resolvedCharacterFilter]
  );

  const duplicateRows =
    data?.entries.filter((row) => (row.duplicateAssignmentIds?.length ?? 0) > 0) ?? [];

  const attentionItems: AttentionItem[] = [];
  if (!data) return attentionItems;

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
            date: utcDayOf(claim.payment.at),
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
            aria-disabled={claiming !== null || undefined}
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
    const period = formatDateRange([o.from, o.through]);
    if (o.declaration?.state === 'waiting') continue;
    const dayOf = (corpView?.overlay.rows ?? []).find(
      (r) =>
        r.corporationId === o.corporationId &&
        r.noticeId === o.noticeId &&
        r.state === 'billed' &&
        r.recordKey !== undefined
    );
    const target =
      o.declarerId !== undefined && canDeclare(o.declaration)
        ? overdueTarget({
            corporationId: o.corporationId,
            corpName: o.corpName,
            noticeId: o.noticeId,
            characterId: o.declarerId,
            periodStart: o.from,
            period,
            ...(o.declaration ? { declaration: o.declaration } : {}),
            ...(dayOf ? { row: dayOf } : {}),
          })
        : undefined;
    if (target && resolve.hidden.has(target.hideKey)) continue;
    attentionItems.push({
      id: `corp-overdue:${o.corporationId}:${o.noticeId}`,
      tone: 'warning',
      title: t('miningTax.corpBook.attention.overdueTitle', {
        corp: o.corpName,
        period,
        date: utcDayOf(o.issuedAt),
      }),
      detail: (
        <>
          <p>{t('miningTax.corpBook.attention.overdueDetail', { code: o.code })}</p>
          {o.declaration && (
            <CorpDeclarationStatus declaration={o.declaration} corpName={o.corpName} />
          )}
        </>
      ),
      ...(target ? { action: resolveActions(target) } : {}),
    });
  }
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
    const every = readsEveryDivision(divisions);
    const corpName = group[0].corpName;
    const only = group.length === 1 ? group[0] : undefined;
    const total = group.reduce((sum, u) => sum + u.amount, 0);
    const target = uncreditedTarget(group, corpView?.overlay.rows ?? []);
    if (resolve.hidden.has(target.hideKey) || target.answered) continue;
    attentionItems.push({
      id: `corp-uncredited:${corporationId}`,
      tone: 'warning',
      action: resolveActions(target),
      title: only
        ? t(
            every
              ? 'miningTax.corpBook.attention.uncreditedEveryTitle'
              : 'miningTax.corpBook.attention.uncreditedTitle',
            { corp: corpName, amount: formatIsk(only.amount, 0), date: utcDayOf(only.at) }
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
                  time: dateTimeAt(only.at, zone),
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
                      time: dateTimeAt(u.at, zone),
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
  for (const group of corp.inReview) {
    const target = inReviewTarget(group);
    if (resolve.hidden.has(target.hideKey)) continue;
    const only = group.donations.length === 1 ? group.donations[0] : undefined;
    const total = group.donations.reduce((sum, d) => sum + d.amount, 0);
    attentionItems.push({
      id: `corp-in-review:${group.corporationId}`,
      tone: 'warning',
      action: resolveActions(target),
      title: only
        ? t('miningTax.corpBook.attention.inReviewTitle', {
            corp: group.corpName,
            amount: formatIsk(only.amount, 0),
            date: utcDayOf(only.at),
          })
        : t('miningTax.corpBook.attention.inReviewTitleMany', {
            corp: group.corpName,
            n: group.donations.length,
            amount: formatIsk(total, 0),
          }),
      detail: (
        <>
          <p>{t('miningTax.corpBook.attention.inReviewDetail')}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {group.donations.map((d) => (
              <li key={d.id}>
                {t('miningTax.corpBook.attention.inReviewItem', {
                  amount: formatIsk(d.amount, 0),
                  time: dateTimeAt(d.at, zone),
                })}
                {d.reason &&
                  ` — ${t('miningTax.corpBook.attention.inReviewReason', { reason: d.reason })}`}
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }
  const inView = (id: number) =>
    resolvedCharacterFilter === 'all' || resolvedCharacterFilter.has(id);
  const seenDays = new Set<string>();
  const overdueIds = new Set(corp.overdue.map((o) => `${o.corporationId}:${o.noticeId}`));
  for (const row of corpView?.overlay.rows ?? []) {
    if (!inView(row.characterId)) continue;
    const by = keptBy(row);
    if (
      by === 'declaration' &&
      row.noticeId !== undefined &&
      overdueIds.has(`${row.corporationId}:${row.noticeId}`)
    )
      continue;
    const figure = by === undefined && figureNeedsAnswer(row);
    if (by === undefined && !figure) continue;
    const target = by ? keptTarget(row, by) : figureTarget(row);
    if (resolve.hidden.has(target.hideKey) || seenDays.has(target.hideKey)) continue;
    seenDays.add(target.hideKey);
    const kept = target.problem.kind === 'kept' ? target.problem : undefined;
    const d = row.dispute;
    attentionItems.push({
      id: `corp-${by ? `kept-${by}` : 'figure'}:${target.hideKey}`,
      tone: 'warning',
      title: kept
        ? t(
            kept.by === 'declaration'
              ? 'miningTax.resolve.strip.keptDeclaration'
              : 'miningTax.resolve.strip.kept',
            { corp: row.corpName, date: row.date }
          )
        : d?.rate
          ? d.personalPct === undefined
            ? t('miningTax.resolve.strip.rateUnrecorded', {
                corp: row.corpName,
                date: row.date,
                book: d.bookPct,
              })
            : t('miningTax.resolve.strip.rate', {
                corp: row.corpName,
                date: row.date,
                book: d.bookPct,
                yours: d.personalPct,
              })
          : t('miningTax.resolve.strip.quantity', { corp: row.corpName, date: row.date }),
      detail: kept ? (
        <>
          {kept.reason && <p>{kept.reason}</p>}
          {kept.nextStep && (
            <p className="font-semibold text-text">
              {t('miningTax.resolve.facts.nextStep', { step: kept.nextStep })}
            </p>
          )}
        </>
      ) : (
        <p>{t('miningTax.resolve.strip.figureDetail', { amount: formatIsk(row.billed, 0) })}</p>
      ),
      action: resolveActions(target),
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
  const unlinked = unlinkedPayeesItem(unlinkedPayees, t, openPayeeManager);
  if (unlinked) attentionItems.push(unlinked);
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
