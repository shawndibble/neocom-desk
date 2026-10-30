import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection } from '@/components/ui';
import { beginGrant } from '@/app/grantAction';
import { formatIsk } from '@/lib/isk';
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import type { MultiSelectFilter } from '@/lib/multiSelectFilter';
import { claimKeyOf } from '@/features/miningTax/corpBook/useAutoClaimDonations';
import type { CorpBookView } from '@/features/miningTax/corpBook/corpBookView';
import { systemLabel } from '@/features/miningTax/names';
import { pricesAtHubOnDate, sellFallbackAtHubOnDate } from '@/features/miningTax/pricing';
import { findPricingGaps } from '@/features/miningTax/pricingGaps';
import type { AttentionItem } from '@/features/miningTax/AttentionStrip';
import { tagAsIgnored, tagAsMoonOre } from '@/features/miningTax/typeOverrides';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import type { PayeeRecord } from '@/db';
import type { TradeHub } from '@/market/hubs';
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
  payeeById: ReadonlyMap<string, PayeeRecord>;
  corpView: CorpBookView | null;
  failedClaims: ReadonlySet<string>;
  reloadCorpBooks: () => void;
  systemName: (dr: DisplayRow) => string;
  systemNames: ReadonlyMap<number, string>;
  refresh: () => void;
  openDetail: (dr: DisplayRow) => void;
}

/** What needs the pilot's attention above the ledger: lapsed logins, missing prices, duplicates, unclaimed donations, unclassified ore. */
export function useTaxAttentionItems({
  data,
  resolvedCharacterFilter,
  personalRows,
  payeeById,
  corpView,
  failedClaims,
  reloadCorpBooks,
  systemName,
  systemNames,
  refresh,
  openDetail,
}: Args): AttentionItem[] {
  const { t } = useTranslation();
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
    attentionItems.push({
      id: 'duplicates',
      tone: 'warning',
      title: t('miningTax.duplicateTitle'),
      detail: (
        <>
          <p>{t('miningTax.duplicateHint')}</p>
          <ul className="space-y-0.5">
            {duplicateRows.map((row) => (
              <li key={`${row.characterId}:${row.entry.date}:${row.entry.solarSystemId}`}>
                {row.characterName} — {row.entry.date} —{' '}
                {systemLabel(systemNames, row.entry.solarSystemId)}
              </li>
            ))}
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
