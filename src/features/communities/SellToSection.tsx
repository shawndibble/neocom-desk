import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection, TextArea } from '@/components/ui';
import { quoteIsHeld } from '@/engine/communities/buyback';
import type { CommunityRequest, RequestPledge } from '@/engine/communities/requests';
import { CopyablePrice } from '@/features/market/CopyablePrice';
import { formatIsk } from '@/lib/isk';
import { formatNumber } from '@/lib/numberLocale';
import { formatDateOnly } from '@/lib/timestamp';
import { saveMyQuote } from './requestStore';
import { quotePile, type PileQuote } from './sellTo';

/**
 * Sell to a standing buyback Request (issue #4780): paste a pile, see one
 * figure at the Request's Rate, hold it 14 days. The Quote is saved on the
 * Member's own Pledge document the moment it is priced, and a second paste
 * replaces it. The contract itself is made in game, to the buyer named.
 */
export function SellToSection({
  request,
  characterId,
  communityId,
  myPledge,
  buyerName,
  now,
  refreshPledges,
}: {
  request: CommunityRequest;
  characterId: number;
  communityId: string;
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
  const { standing } = request;
  if (!standing) return null;

  const held = myPledge?.quote;
  const stillHeld = held !== undefined && quoteIsHeld(held, now);

  const getQuote = async () => {
    setBusy('quote');
    setError(null);
    try {
      const result = await quotePile(text, standing, Date.now());
      setNotes(result);
      // Nothing priced is no quote: say why, keep what is held.
      if (result.quote.lines.length === 0) return;
      await saveMyQuote(characterId, communityId, request.id, result.quote);
      await refreshPledges(request.id);
      setText('');
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
      await refreshPledges(request.id);
      setNotes(null);
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
                ? t('communities.board.sellTo.heldUntil', {
                    date: formatDateOnly(new Date(held.expiresAt)),
                  })
                : t('communities.board.sellTo.expired', {
                    date: formatDateOnly(new Date(held.expiresAt)),
                  })}
            </span>
          </p>
          {stillHeld && (
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
              {held.lines.map((line) => (
                <tr key={line.typeId}>
                  <td className="py-1 pr-2">{line.name}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-text-dim">
                    {formatNumber(line.quantity)}
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatIsk(line.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <label className="block space-y-1">
        <span className="block text-xs text-text-dim">
          {held ? t('communities.board.sellTo.pasteAgain') : t('communities.board.sellTo.paste')}
        </span>
        <TextArea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <NeedsConnection>
          <Button
            size="sm"
            variant="primary"
            loading={busy === 'quote'}
            disabled={text.trim() === ''}
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
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
