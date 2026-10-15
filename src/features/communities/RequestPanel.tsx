import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, SlideOver } from '@/components/ui';
import {
  lineProgress,
  type CommunityRequest,
  type RequestLine,
  type RequestPledge,
} from '@/engine/communities/requests';
import { formatAge } from '@/lib/age';
import { PledgeBar } from './PledgeBar';
import { callableErrorReason } from './callableError';
import { daysLeft } from './requestFormat';
import { extendRequest, setRequestClosed } from './requestStore';

/** "BPC, runs 10, ME 10": what the requester asked of a blueprint line, empty for a plain item. */
function lineSpec(line: RequestLine, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (line.kind === 'item') return '';
  return [
    t(line.kind === 'bpc' ? 'communities.board.kind.bpc' : 'communities.board.kind.bpo'),
    line.runs !== undefined && t('communities.board.spec.runs', { count: line.runs }),
    line.me !== undefined && t('communities.board.spec.me', { value: line.me }),
    line.te !== undefined && t('communities.board.spec.te', { value: line.te }),
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * A Request's side panel, read-only: its terms and each line's progress. The
 * requester also gets Extend 30 days and Close request (Reopen once closed);
 * everyone else has nothing to press yet, since Pledging is a later ticket.
 * `pledges` is empty until then, and a line shows 0 pledged.
 */
export function RequestPanel({
  request,
  mine,
  pledges,
  now,
  characterId,
  communityId,
  onClose,
  onChanged,
}: {
  request: CommunityRequest;
  mine: boolean;
  pledges: readonly RequestPledge[];
  now: number;
  characterId: number;
  communityId: string;
  onClose: () => void;
  /** The Request changed on the server: refetch the board. */
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'extend' | 'close' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (which: 'extend' | 'close', action: () => Promise<unknown>) => {
    setBusy(which);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(
        callableErrorReason(err) === 'too-many-open-requests'
          ? t('communities.board.tooManyOpen')
          : t('communities.board.actionFailed')
      );
    } finally {
      setBusy(null);
    }
  };

  const left = daysLeft(request.expiresAt, now);
  const place = request.location;
  const posted = t('communities.board.posted', { age: formatAge(now - request.createdAt, t) });
  const closes = request.closed
    ? t('communities.board.closedNote')
    : request.expiresAt <= now
      ? t('communities.board.status.expired')
      : left === 0
        ? t('communities.board.closesUnderDay')
        : t('communities.board.closesIn', { count: left });

  return (
    <SlideOver
      open
      onClose={onClose}
      title={
        mine
          ? t('communities.board.panelTitleMine')
          : t('communities.board.panelTitle', { name: request.ownerName })
      }
      subtitle={[place, posted, closes].filter(Boolean).join(' · ')}
    >
      <div className="space-y-3 text-sm">
        {request.terms && (
          <p className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-xs">
            <span className="text-text-dim">{t('communities.board.termsLabel')} </span>
            {request.terms}
          </p>
        )}
        <ul className="divide-y divide-line" aria-label={t('communities.board.linesLabel')}>
          {request.lines.map((line, index) => {
            const spec = lineSpec(line, t);
            return (
              <li key={`${line.typeId}:${line.kind}`} className="space-y-1.5 px-1 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{line.name}</span>
                  {spec && <span className="text-xs text-text-dim">{spec}</span>}
                </div>
                <PledgeBar {...lineProgress(index, line, pledges)} />
              </li>
            );
          })}
        </ul>
        {mine && (
          <div className="flex flex-wrap gap-2">
            {request.closed ? (
              <Button
                size="sm"
                loading={busy === 'close'}
                onClick={() =>
                  void run('close', () =>
                    setRequestClosed(characterId, communityId, request.id, false)
                  )
                }
              >
                {t('communities.board.reopen')}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  loading={busy === 'extend'}
                  onClick={() =>
                    void run('extend', () => extendRequest(characterId, communityId, request.id))
                  }
                >
                  {t('communities.board.extend')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === 'close'}
                  onClick={() =>
                    void run('close', () =>
                      setRequestClosed(characterId, communityId, request.id, true)
                    )
                  }
                >
                  {t('communities.board.close')}
                </Button>
              </>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </SlideOver>
  );
}
