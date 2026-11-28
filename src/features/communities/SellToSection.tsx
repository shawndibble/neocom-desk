import { useEffect, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { LiveNote, Button, NeedsConnection, TextArea, Field, Fields } from '@/components/ui';
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
  const [read, setRead] = useState<{ quotedAt: number; result: QuoteLinksResult } | null>(null);
  const held = myPledge?.quote;
  const stillHeld = held !== undefined && quoteIsHeld(held, now);
  const current = held === undefined || quoteIsCurrent(held, standing);
  const linkState = read && read.quotedAt === held?.quotedAt ? read.result : null;
  const linkRows: LinkedContractRow[] =
    linkState?.status === 'ok'
      ? linkState.links.map((link) => ({
          ...link,
          contract: linkState.contracts.get(link.contractId),
        }))
      : (held?.links ?? []).map((link) => ({ ...link, priceDiffers: false }));
  const heldDate = held ? formatDateOnly(new Date(held.expiresAt)) : '';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held?.quotedAt, characterId, communityId, request.id]);

  const getQuote = async () => {
    setBusy('quote');
    setError(null);
    try {
      const result = await quotePile(text, standing, Date.now());
      setNotes(result);
      if (result.quote.lines.length === 0) return;
      await saveMyQuote(characterId, communityId, request.id, result.quote);
      setText('');
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
      <h3 className="text-xs font-medium uppercase tracking-widest text-text-dim">
        {t('communities.board.sellTo.title', { name: request.ownerName })}
      </h3>
      {held && (
        <div className="space-y-2">
          <p className="flex flex-wrap items-baseline gap-x-3 text-base">
            <CopyablePrice price={held.total}>{formatIsk(held.total)} ISK</CopyablePrice>
            <span className={stillHeld ? 'text-xs text-text-dim' : 'text-xs text-warning'}>
              {stillHeld
                ? t('communities.board.sellTo.heldUntil', { date: heldDate })
                : t('communities.board.sellTo.expired', { date: heldDate })}
            </span>
          </p>
          {stillHeld && !current && (
            <LiveNote className="text-xs text-warning">
              {t('communities.board.sellTo.stale')}
            </LiveNote>
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
            <LiveNote className="text-xs text-text-dim">
              {t('communities.board.buyback.contractReadFailed')}
            </LiveNote>
          )}
        </div>
      )}
      <Fields variant="stacked">
        <Field
          label={
            held ? t('communities.board.sellTo.pasteAgain') : t('communities.board.sellTo.paste')
          }
        >
          <TextArea
            rows={4}
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onSubmitChord={() => {
              if (busy === null && text.trim() !== '') void getQuote();
            }}
          />
        </Field>
      </Fields>
      <div className="flex flex-wrap items-center gap-2">
        <NeedsConnection>
          <Button
            size="sm"
            variant="primary"
            loading={busy === 'quote'}
            aria-disabled={text.trim() === '' || busy !== null || undefined}
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
              aria-disabled={busy !== null || undefined}
              onClick={() => void clear()}
            >
              {t('communities.board.sellTo.clear')}
            </Button>
          </NeedsConnection>
        )}
      </div>
      {notes && notes.quote.lines.length === 0 && (
        <LiveNote className="text-xs text-warning">
          {t('communities.board.sellTo.nothing')}
        </LiveNote>
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
