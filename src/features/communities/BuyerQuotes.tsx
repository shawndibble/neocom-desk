import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import type { QuoteContractStatus } from '@/engine/communities/buyback';
import {
  isSellersContractToBuyer,
  priceDiffers,
  quoteContractStatus,
} from '@/engine/communities/buybackContracts';
import { quoteIsHeld } from '@/engine/communities/buyback';
import type { CommunityRequest, RequestPledge } from '@/engine/communities/requests';
import type { Contract } from '@/esi/endpoints';
import { permissionsForEndpoints } from '@/esi/registry';
import { loadContracts } from '@/features/character/contracts';
import { LiveNote } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { formatDateOnly } from '@/lib/timestamp';
import { characterIdForUid } from '@/sync/uid';
import { rememberBuybackLinks, type BuybackLinkInfo } from './buybackLinks';
import { QuoteContractList, type LinkedContractRow } from './QuoteContractList';
import { requestHeadline } from './requestFormat';

const CONTRACT_GROUPS = permissionsForEndpoints(['getCharacterContracts']);

type Contracts =
  | { status: 'loading' }
  | { status: 'needs-scope' | 'failed' }
  | { status: 'ok'; byId: ReadonlyMap<number, Contract> };

export function BuyerQuotes({
  request,
  pledges,
  memberNames,
  communityId,
  communityName,
  buyerCharacterId,
  now,
}: {
  request: CommunityRequest;
  pledges: readonly RequestPledge[];
  memberNames: ReadonlyMap<string, string>;
  communityId: string;
  communityName: string;
  buyerCharacterId: number;
  now: number;
}) {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<Contracts>({ status: 'loading' });
  const quoted = useMemo(
    () =>
      pledges
        .flatMap((pledge) => (pledge.quote ? [{ uid: pledge.uid, quote: pledge.quote }] : []))
        .sort((a, b) => b.quote.quotedAt - a.quote.quotedAt),
    [pledges]
  );
  const wantedKey = useMemo(
    () =>
      [...new Set(quoted.flatMap(({ quote }) => (quote.links ?? []).map((l) => l.contractId)))]
        .sort((x, y) => x - y)
        .join(','),
    [quoted]
  );

  useEffect(() => {
    if (wantedKey === '') return;
    let cancelled = false;
    loadContracts(buyerCharacterId).then(
      (read) => {
        if (cancelled) return;
        if (read.needsReauth) return setContracts({ status: 'needs-scope' });
        if (!read.cached) return setContracts({ status: 'failed' });
        setContracts({
          status: 'ok',
          byId: new Map(read.cached.data.map((c) => [c.contract_id, c])),
        });
      },
      () => !cancelled && setContracts({ status: 'failed' })
    );
    return () => {
      cancelled = true;
    };
  }, [buyerCharacterId, wantedKey]);

  const byId = contracts.status === 'ok' ? contracts.byId : undefined;
  const title = requestHeadline(request, t);

  const rowsByUid = useMemo(() => {
    const out = new Map<string, LinkedContractRow[]>();
    for (const { uid, quote } of quoted) {
      const sellerId = characterIdForUid(uid);
      const rows = (quote.links ?? []).flatMap((link): LinkedContractRow[] => {
        const contract = byId?.get(link.contractId);
        if (contract && !isSellersContractToBuyer(contract, sellerId, buyerCharacterId)) return [];
        const status: QuoteContractStatus = contract
          ? (quoteContractStatus(contract.status, Date.parse(contract.date_expired), now) ??
            link.status)
          : link.status;
        return [
          {
            contractId: link.contractId,
            status,
            contract,
            unverified: contract === undefined,
            priceDiffers:
              contract?.price !== undefined && priceDiffers(contract.price, quote.total),
          },
        ];
      });
      out.set(uid, rows);
    }
    return out;
  }, [quoted, byId, buyerCharacterId, now]);

  const found = useMemo(() => {
    const map = new Map<number, BuybackLinkInfo>();
    for (const { uid, quote } of quoted) {
      for (const row of rowsByUid.get(uid) ?? []) {
        if (row.unverified) continue;
        map.set(row.contractId, {
          requestId: request.id,
          communityId,
          communityName,
          requestTitle: title,
          quotedTotal: quote.total,
        });
      }
    }
    return map;
  }, [quoted, rowsByUid, request.id, communityId, communityName, title]);
  useEffect(() => {
    void rememberBuybackLinks(buyerCharacterId, found).catch(() => undefined);
  }, [found, buyerCharacterId]);

  return (
    <section
      aria-label={t('communities.board.buyback.quotesTitle')}
      className="space-y-2 rounded-xs border border-line px-3 py-2"
    >
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-dim">
        {t('communities.board.buyback.quotesTitle')}
      </h3>
      {quoted.length === 0 && (
        <p className="text-xs text-text-dim">{t('communities.board.buyback.noQuotes')}</p>
      )}
      <ul className="divide-y divide-line">
        {quoted.map(({ uid, quote }) => {
          const rows = rowsByUid.get(uid) ?? [];
          return (
            <li key={uid} className="space-y-1 py-2">
              <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-medium">
                  {memberNames.get(uid) ?? t('communities.board.admin.unknownPledger')}
                </span>
                <span className="tabular-nums">{formatIsk(quote.total)} ISK</span>
                <span className="text-xs text-text-dim">
                  {quoteIsHeld(quote, now)
                    ? t('communities.board.sellTo.heldUntil', {
                        date: formatDateOnly(new Date(quote.expiresAt)),
                      })
                    : t('communities.board.sellTo.expired', {
                        date: formatDateOnly(new Date(quote.expiresAt)),
                      })}
                </span>
              </p>
              <QuoteContractList
                label={t('communities.board.buyback.contractsLabel')}
                rows={rows}
                quotedTotal={quote.total}
                viewerCharacterId={buyerCharacterId}
                now={now}
              />
            </li>
          );
        })}
      </ul>
      {contracts.status === 'needs-scope' && (
        <p className="text-xs text-text-dim">
          {t('communities.board.buyback.contractNeedsPermission')}{' '}
          <GrantMissingLink groups={CONTRACT_GROUPS} />
        </p>
      )}
      {contracts.status === 'failed' && (
        <LiveNote className="text-xs text-text-dim">
          {t('communities.board.buyback.contractReadFailed')}
        </LiveNote>
      )}
    </section>
  );
}
