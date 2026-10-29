import { useEffect, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { Button, NeedsConnection, TextArea } from '@/components/ui';
import { permissionsForEndpoints } from '@/esi/registry';
import { quoteIsCurrent, quoteIsHeld, type StandingRequest } from '@/engine/communities/buyback';
import type { CommunityRequest, RequestPledge } from '@/engine/communities/requests';
import { CopyablePrice } from '@/features/market/CopyablePrice';
import { formatIsk } from '@/lib/isk';
import { formatNumber } from '@/lib/numberLocale';
import { formatDateOnly } from '@/lib/timestamp';
import { rememberBuybackLinks } from './buybackLinks';
import { QuoteContractList, type LinkedContractRow } from './QuoteContractList';
import { requestHeadline } from './requestFormat';
import { DELIVERY_ENDPOINTS } from './requestDelivery';
import { saveMyQuote } from './requestStore';
import { syncQuoteLinks, type QuoteLinksResult } from './quoteLinks';
import { quotePile, type PileQuote } from './sellTo';

/**
 * Sell to a standing buyback Request (issue #4780): paste a pile, see one
 * figure at the Request's Rate, hold it 14 days. The Quote is saved on the
 * Member's own Pledge document the moment it is priced, and a second paste
 * replaces it. The contract itself is made in game, to the buyer named.
 */
const CONTRACT_GROUPS = permissionsForEndpoints(DELIVERY_ENDPOINTS);

export function SellToSection({
  request,
  standing,
  characterId,
  communityId,
  communityName,
  myPledge,
  buyerName,
  now,
  refreshPledges,
}: {
  request: CommunityRequest;
  /** The Request's terms: it is a standing Request, or there is nothing to sell to. */
  standing: StandingRequest;
  characterId: number;
  communityId: string;
  communityName: string;
  myPledge: RequestPledge | undefined;
  buyerName: string;
  now: number;
  refreshPledges: (requestId: string) => Promise<RequestPledge[]>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'quote' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<PileQuote | null>(null);
  // Tagged with the quote it was read for: a replaced quote's rows are not the new one's.
  const [read, setRead] = useState<{ quotedAt: number; result: QuoteLinksResult } | null>(null);
  const held = myPledge?.quote;
  const stillHeld = held !== undefined && quoteIsHeld(held, now);
  const current = held === undefined || quoteIsCurrent(held, standing);
  // What this side can say about the linked contracts: the read just made, else the stored ids and statuses.
  const linkState = read && read.quotedAt === held?.quotedAt ? read.result : null;
  const linkRows: LinkedContractRow[] =
    linkState?.status === 'ok'
      ? linkState.links.map((link) => ({
          ...link,
          contract: linkState.contracts.get(link.contractId),
        }))
      : (held?.links ?? []).map((link) => ({ ...link, priceDiffers: false }));
  const heldDate = held ? formatDateOnly(new Date(held.expiresAt)) : '';

  // Which of the seller's contracts are this quote's: read when a held quote shows, not on a timer.
  useEffect(() => {
    if (!held || !quoteIsHeld(held, Date.now())) return;
    let cancelled = false;
    syncQuoteLinks({ characterId, communityId, request, quote: held, now: Date.now() }).then(
      (result) => {
        if (cancelled) return;
        setRead({ quotedAt: held.quotedAt, result });
        void rememberBuybackLinks(
          characterId,
          new Map(
            result.links.map((link) => [
              link.contractId,
              {
                requestId: request.id,
                communityId,
                communityName,
                requestTitle: requestHeadline(request, t),
                quotedTotal: held.total,
              },
            ])
          )
        ).catch(() => undefined);
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
    // The quote's date identifies it: a re-read of the same quote is not a reason to read contracts again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held?.quotedAt, characterId, communityId, request.id]);

  const getQuote = async () => {
    setBusy('quote');
    setError(null);
    try {
      const result = await quotePile(text, standing, Date.now());
      setNotes(result);
      // Nothing priced is no quote: say why, keep what is held.
      if (result.quote.lines.length === 0) return;
      await saveMyQuote(characterId, communityId, request.id, result.quote);
      setText('');
      // The quote is saved: a failed re-read must not read as a failed quote.
      await refreshPledges(request.id).catch((err: unknown) =>
        console.warn('Pledges could not be re-read after a quote', err)
      );
    } catch (err) {
      console.warn('Quote could not be made', err);
      setError(t('communities.board.sellTo.failed'));
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    setBusy('clear');
    setError(null);
    try {
      await saveMyQuote(characterId, communityId, request.id, null);
      setNotes(null);
      await refreshPledges(request.id).catch((err: unknown) =>
        console.warn('Pledges could not be re-read after clearing a quote', err)
      );
    } catch (err) {
      console.warn('Quote could not be cleared', err);
      setError(t('communities.board.sellTo.clearFailed'));
    } finally {
      setBusy(null);
    }
  };

  const names = (list: readonly { name: string }[]) => list.map((entry) => entry.name).join(', ');

  return (
    <section
      aria-label={t('communities.board.sellTo.label')}
      className="space-y-3 rounded-xs border border-line px-3 py-2"
    >
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-dim">
        {t('communities.board.sellTo.title', { name: request.ownerName })}
      </h3>
      {held && (
        <div className="space-y-2">
          <p className="flex flex-wrap items-baseline gap-x-3 text-lg">
            <CopyablePrice price={held.total}>{formatIsk(held.total)} ISK</CopyablePrice>
            <span className={stillHeld ? 'text-xs text-text-dim' : 'text-xs text-warning'}>
              {stillHeld
                ? t('communities.board.sellTo.heldUntil', { date: heldDate })
                : t('communities.board.sellTo.expired', { date: heldDate })}
            </span>
          </p>
          {stillHeld && !current && (
            <p role="status" className="text-xs text-warning">
              {t('communities.board.sellTo.stale')}
            </p>
          )}
          {stillHeld && current && (
            <p className="text-xs text-text-dim">
              {t('communities.board.sellTo.nextStep', {
                name: buyerName,
                price: formatIsk(held.total),
              })}
            </p>
          )}
          <table className="w-full text-xs">
            <caption className="sr-only">{t('communities.board.sellTo.linesLabel')}</caption>
            <tbody className="divide-y divide-line">
              {held.lines.map((line, index) => (
                <tr key={`${line.typeId}-${index}`}>
                  <td className="py-1 pr-2">{line.name}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-text-dim">
                    {formatNumber(line.quantity)}
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatIsk(line.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stillHeld && (
            <QuoteContractList
              label={t('communities.board.buyback.contractsLabel')}
              rows={linkRows}
              quotedTotal={held.total}
              viewerCharacterId={characterId}
              now={now}
            />
          )}
          {linkState?.status === 'needs-scope' && (
            <p className="text-xs text-text-dim">
              {t('communities.board.buyback.contractNeedsPermission')}{' '}
              <GrantMissingLink groups={CONTRACT_GROUPS} />
            </p>
          )}
          {linkState?.status === 'read-failed' && (
            <p role="status" className="text-xs text-text-dim">
              {t('communities.board.buyback.contractReadFailed')}
            </p>
          )}
        </div>
      )}
      <label className="block space-y-1">
        <span className="block text-xs text-text-dim">
          {held ? t('communities.board.sellTo.pasteAgain') : t('communities.board.sellTo.paste')}
        </span>
        <TextArea
          rows={4}
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSubmitChord={() => {
            if (busy === null && text.trim() !== '') void getQuote();
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <NeedsConnection>
          <Button
            size="sm"
            variant="primary"
            loading={busy === 'quote'}
            disabled={text.trim() === '' || busy !== null}
            onClick={() => void getQuote()}
          >
            {t('communities.board.sellTo.getQuote')}
          </Button>
        </NeedsConnection>
        {held && (
          <NeedsConnection>
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'clear'}
              disabled={busy !== null}
              onClick={() => void clear()}
            >
              {t('communities.board.sellTo.clear')}
            </Button>
          </NeedsConnection>
        )}
      </div>
      {notes && notes.quote.lines.length === 0 && (
        <p role="status" className="text-xs text-warning">
          {t('communities.board.sellTo.nothing')}
        </p>
      )}
      {notes && notes.notBought.length > 0 && (
        <p className="text-xs text-text-dim">
          {t('communities.board.sellTo.notBought', { names: names(notes.notBought) })}
        </p>
      )}
      {notes && notes.unpriced.length > 0 && (
        <p className="text-xs text-warning">
          {t('communities.board.sellTo.unpriced', { names: names(notes.unpriced) })}
        </p>
      )}
      {notes && notes.unmatched.length > 0 && (
        <p className="text-xs text-text-dim">
          {t('communities.board.sellTo.unmatched', { names: notes.unmatched.join(', ') })}
        </p>
      )}
      {notes && notes.dropped > 0 && (
        <p className="text-xs text-warning">
          {t('communities.board.sellTo.dropped', { count: notes.dropped })}
        </p>
      )}
      {error && <InlineError>{error}</InlineError>}
    </section>
  );
}
