import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { SlideOver, NeedsConnection, Button } from '@/components/ui';
import { permissionsForEndpoints, SEND_MAIL_ENDPOINTS } from '@/esi/registry';
import { pledgeEntryAfterManual } from '@/engine/communities/delivery';
import {
  canPledge,
  isStalePledge,
  lineKey,
  lineProgress,
  pledgedRequestLines,
  withPledgeLine,
  withdrawPledgeLine,
  type CommunityRequest,
  type RequestLine,
  type RequestPledge,
} from '@/engine/communities/requests';
import { formatAge } from '@/lib/age';
import { formatIsk } from '@/lib/isk';
import { itemsSummary, mailSubject } from '@/engine/communities/requestMail';
import { mailSafe } from '@/lib/mailSafe';
import { characterIdForUid } from '@/sync/uid';
import { communityRequestsUrl } from './communityStore';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MessageRequesterButton } from './MessageRequesterButton';
import { PledgeRow } from './PledgeRow';
import { BuyerQuotes } from './BuyerQuotes';
import { SellToSection } from './SellToSection';
import { callableErrorReason } from './callableError';
import { buyerOf } from './quoteLinks';
import {
  buildPledgeMail,
  pledgeMailDeps,
  sendPledgeMail,
  type PledgeMailOutcome,
} from './pledgeMail';
import { MAX_REQUEST_MAILS_PER_DAY } from '@/engine/communities/requests';
import { notePledgeEdit } from './pledgeWrites';
import { DELIVERY_ENDPOINTS, slotKey } from './requestDelivery';
import { useDeliverySync } from './useDeliverySync';
import { buybackLineKey } from '@/engine/communities/buyback';
import { buyLineLabel, describeExpiry, requestHeadline, standingRateLine } from './requestFormat';
import {
  extendRequest,
  removePledge,
  removeRequest,
  setRequestClosed,
  updateMyPledge,
} from './requestStore';

const DELIVERY_GROUPS = permissionsForEndpoints(DELIVERY_ENDPOINTS);
const SEND_MAIL_GROUPS = permissionsForEndpoints(SEND_MAIL_ENDPOINTS);

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
 * A Request's side panel: its terms and each line's progress. A Member who
 * can Pledge (any Member but the requester, while the Request is open) also
 * gets each line's quantity field with Pledge, Update pledge and Withdraw
 * (issue #3808); Pledges are written straight to the Member's own document.
 * The requester gets Extend 30 days and Close request (Reopen once closed)
 * and no Pledge controls; everyone else also gets Message <requester>…, which
 * opens an in-game mail to them. The Community admin also gets Remove
 * request… and, per Pledger, Remove… on their Pledge (issue #3812), each behind
 * a confirm; the server checks the admin, this only hides the controls.
 */
export function RequestPanel({
  request,
  mine,
  myUid,
  pledges,
  now,
  characterId,
  communityId,
  communityName,
  isAdmin,
  memberNames,
  onClose,
  onChanged,
  onEdit,
  onRemoved,
  refreshPledges,
}: {
  request: CommunityRequest;
  mine: boolean;
  myUid: string;
  pledges: readonly RequestPledge[];
  now: number;
  characterId: number;
  communityId: string;
  communityName: string;
  /** The viewer administers this Community: may remove the Request or any Pledge. */
  isAdmin: boolean;
  /** Member uid to display name, for naming each Pledger to the admin. */
  memberNames: ReadonlyMap<string, string>;
  onClose: () => void;
  /** The Request changed on the server: refetch the board. */
  onChanged: () => void;
  /** The requester opens the edit dialog for this Request. */
  onEdit: () => void;
  /** The admin removed this Request: close the panel and refetch the board. */
  onRemoved: () => void;
  /** Re-reads this Request's Pledges into the board after a Pledge write. */
  refreshPledges: (requestId: string) => Promise<RequestPledge[]>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'extend' | 'close' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pledgeBusy, setPledgeBusy] = useState<string | null>(null);
  const [pledgeError, setPledgeError] = useState<string | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  /** What the Pledge mail to the requester came to, for the quiet line under the lines. */
  const [mailOutcome, setMailOutcome] = useState<PledgeMailOutcome | null>(null);
  /** Pledge mails settled this session (sent, or already on the server): not asked again on an update. */
  const mailSettled = useRef(false);
  const [removing, setRemoving] = useState<
    { kind: 'request' } | { kind: 'pledge'; uid: string; name: string } | null
  >(null);

  // The board only loads Pledges for open Requests, and may be minutes old: read this one fresh.
  useEffect(() => {
    refreshPledges(request.id).catch(() =>
      setPledgeError(t('communities.board.pledgesLoadFailed'))
    );
  }, [request.id, refreshPledges, t]);

  const myPledge = pledges.find((p) => p.uid === myUid);
  // A buyback is sold to, not pledged on: Sell to arrives with the quote.
  const mayPledge = !request.standing && canPledge(request, myUid, now);
  const lacksContracts = useCharacterLacksEndpoints(characterId, DELIVERY_ENDPOINTS);
  const lacksSendMail = useCharacterLacksEndpoints(characterId, SEND_MAIL_ENDPOINTS);
  const wantsMail = mayPledge && request.notify.mail;
  const delivery = useDeliverySync({
    characterId,
    communityId,
    requestId: request.id,
    enabled: mayPledge && myPledge !== undefined && !lacksContracts,
    tick: syncTick,
    refreshPledges,
  });

  /** One in-game mail to the requester about a Pledge already saved; a failure never touches the Pledge. */
  const mailRequester = async (saved: RequestPledge) => {
    const lines = pledgedRequestLines(request, saved.lines);
    if (lines.length === 0) return;
    const outcome = await sendPledgeMail(
      {
        compose: (reservation) =>
          buildPledgeMail(t, {
            communityName: reservation.communityName,
            pledgerName: reservation.pledgerName,
            requesterName: reservation.requesterName,
            lines,
            link: communityRequestsUrl(communityId),
          }),
      },
      pledgeMailDeps(characterId, communityId, request.id)
    );
    // Sent, or sent before: a later update does not ask again. A failure may be tried on the next one.
    if (outcome === 'sent' || outcome === 'alreadyMailed' || outcome === 'unsure') {
      mailSettled.current = true;
    }
    setMailOutcome(outcome === 'alreadyMailed' ? null : outcome);
  };

  const changePledge = async (
    key: string,
    change: Parameters<typeof updateMyPledge>[3],
    options: { mail?: boolean } = {}
  ) => {
    setPledgeBusy(key);
    setPledgeError(null);
    // A delivery run that began before this edit read the Pledge as it was: it must not write over it.
    notePledgeEdit(characterId, communityId);
    try {
      const saved = await updateMyPledge(characterId, communityId, request.id, change);
      await refreshPledges(request.id);
      if (options.mail && saved && wantsMail && !lacksSendMail && !mailSettled.current) {
        setMailOutcome(null);
        await mailRequester(saved).catch((err) => {
          console.warn('Pledge mail could not be sent', err);
          setMailOutcome('failed');
        });
      }
    } catch (err) {
      console.warn('Pledge could not be saved', err);
      setPledgeError(t('communities.board.pledgeFailed'));
    } finally {
      notePledgeEdit(characterId, communityId);
      setPledgeBusy(null);
    }
  };

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

  const requesterId = mine ? null : characterIdForUid(request.ownerUid);
  const items = request.standing
    ? requestHeadline(request, t)
    : itemsSummary(
        request.lines.map((line) => line.name),
        (count) => t('communities.board.more', { count })
      );
  const buyerId = request.standing?.buyerCharacterId ?? null;
  // The Character the contracts go to, and so who reads the Quotes' contracts.
  const contractBuyerId = buyerOf(request);
  const isBuyerView = request.standing !== undefined && (mine || contractBuyerId === characterId);
  // A buyer is a Member, so the roster names them; never fall back to the requester, who is not who the contract goes to.
  const buyerName =
    buyerId === null
      ? request.ownerName
      : (memberNames.get(`char:${buyerId}`) ??
        t('communities.board.buyback.buyerUnknown', { id: buyerId }));

  const place = request.location;
  const posted = t('communities.board.posted', { age: formatAge(now - request.createdAt, t) });
  const closes = request.closed
    ? t('communities.board.closedNote')
    : request.standing
      ? t('communities.board.buyback.noExpiry')
      : describeExpiry(request.expiresAt, now, t, {
          underDay: 'communities.board.closesUnderDay',
          days: 'communities.board.closesIn',
        });

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
        {request.standing && (
          <section
            aria-label={t('communities.board.buyback.termsLabel')}
            className="space-y-2 rounded-xs border border-line bg-panel-2 px-3 py-2"
          >
            <p className="text-base font-medium tabular-nums">
              {standingRateLine(request.standing, t)}
            </p>
            <p className="text-xs text-text-dim">
              {t('communities.board.buyback.contractsTo', { name: buyerName })}
            </p>
            <ul aria-label={t('communities.board.buyback.buysLabel')} className="text-xs">
              {request.standing.buyLines.map((line) => (
                <li key={buybackLineKey(line)}>{buyLineLabel(line, t)}</li>
              ))}
            </ul>
          </section>
        )}
        {request.standing && isBuyerView && contractBuyerId !== null && (
          <BuyerQuotes
            request={request}
            pledges={pledges}
            memberNames={memberNames}
            communityId={communityId}
            communityName={communityName}
            buyerCharacterId={contractBuyerId}
            now={now}
          />
        )}
        {request.standing && !isBuyerView && !request.closed && (
          <SellToSection
            request={request}
            standing={request.standing}
            communityName={communityName}
            characterId={characterId}
            communityId={communityId}
            myPledge={myPledge}
            buyerName={buyerName}
            now={now}
            refreshPledges={refreshPledges}
          />
        )}
        {request.lines.length > 0 && (
          <ul className="divide-y divide-line" aria-label={t('communities.board.linesLabel')}>
            {request.lines.map((line, index) => {
              const own = myPledge?.lines[index];
              const key = lineKey(line);
              return (
                <PledgeRow
                  key={key}
                  line={line}
                  spec={lineSpec(line, t)}
                  progress={lineProgress(index, line, pledges)}
                  own={own}
                  stale={own !== undefined && isStalePledge(own, myPledge?.updatedAt ?? 0, now)}
                  canPledge={mayPledge}
                  busy={pledgeBusy === key}
                  onPledge={(quantity) =>
                    void changePledge(key, (lines) => withPledgeLine(lines, index, quantity), {
                      mail: true,
                    })
                  }
                  onWithdraw={() =>
                    void changePledge(key, (lines) => withdrawPledgeLine(lines, index))
                  }
                  flags={delivery?.flags.get(slotKey(request.id, index))}
                  manualEntry={mayPledge}
                  onSaveDelivered={(amount) =>
                    // A cleared amount falls back to contracts: run the sync again after saving.
                    void changePledge(key, (lines) => {
                      const stored = lines[index];
                      return stored
                        ? { ...lines, [index]: pledgeEntryAfterManual(stored, amount) }
                        : lines;
                    }).then(() => setSyncTick((n) => n + 1))
                  }
                />
              );
            })}
          </ul>
        )}
        {mayPledge && (
          <p className="text-xs text-text-dim">
            {t('communities.board.deliveryNote', { name: request.ownerName })}
          </p>
        )}
        {mayPledge && lacksContracts && myPledge && (
          <p className="text-xs text-text-dim">
            {t('communities.board.deliveryNeedsPermission')}{' '}
            <GrantMissingLink groups={DELIVERY_GROUPS} />
          </p>
        )}
        {!mayPledge && !mine && !request.standing && myPledge && (
          <p className="text-xs text-text-dim">{t('communities.board.deliveryClosed')}</p>
        )}
        {delivery?.status === 'read-failed' && (
          <p role="alert" className="text-xs text-text-dim">
            {t('communities.board.deliveryReadFailed')}
          </p>
        )}
        {delivery?.status === 'write-failed' && (
          <p role="alert" className="text-xs text-text-dim">
            {t('communities.board.deliveryWriteFailed')}
          </p>
        )}
        {wantsMail && lacksSendMail && (
          <p className="text-xs text-text-dim">
            {t('communities.board.pledgeMail.needsPermission', { name: request.ownerName })}{' '}
            <GrantMissingLink groups={SEND_MAIL_GROUPS} />
          </p>
        )}
        {mailOutcome && (
          <p role={mailOutcome === 'sent' ? 'status' : 'alert'} className="text-xs text-text-dim">
            {t(`communities.board.pledgeMail.${mailOutcome}`, {
              name: request.ownerName,
              max: MAX_REQUEST_MAILS_PER_DAY,
            })}
          </p>
        )}
        {pledgeError && (
          <p role="alert" className="text-xs text-danger">
            {pledgeError}
          </p>
        )}
        {requesterId !== null && (
          <MessageRequesterButton
            characterId={characterId}
            recipientId={requesterId}
            name={request.ownerName}
            subject={mailSubject(t('communities.board.mail.subject', { items }))}
            body={t('communities.board.mail.body', {
              name: mailSafe(request.ownerName),
              community: mailSafe(communityName),
              items: mailSafe(items),
            })}
          />
        )}
        {isAdmin && pledges.length > 0 && (
          <section aria-label={t('communities.board.admin.pledgesLabel')} className="space-y-1">
            <p className="text-xs text-text-dim">{t('communities.board.admin.pledgesLabel')}</p>
            <ul className="divide-y divide-line">
              {pledges.map((pledge) => {
                const name =
                  memberNames.get(pledge.uid) ?? t('communities.board.admin.unknownPledger');
                return (
                  <li key={pledge.uid} className="flex min-h-9 items-center gap-2 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="text-text-dim">
                      {pledge.quote
                        ? t('communities.board.admin.quoteSummary', {
                            price: formatIsk(pledge.quote.total),
                          })
                        : t('communities.board.admin.pledgeSummary', {
                            count: Object.keys(pledge.lines).length,
                          })}
                    </span>
                    <NeedsConnection>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('communities.board.admin.removePledgeFor', { name })}
                        onClick={() => setRemoving({ kind: 'pledge', uid: pledge.uid, name })}
                      >
                        {t('communities.board.admin.removePledge')}
                      </Button>
                    </NeedsConnection>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {isAdmin && (
          <div>
            <NeedsConnection>
              <Button size="sm" variant="danger" onClick={() => setRemoving({ kind: 'request' })}>
                {t('communities.board.admin.removeRequest')}
              </Button>
            </NeedsConnection>
          </div>
        )}
        {mine && (
          <div className="flex flex-wrap gap-2">
            {request.closed ? (
              <NeedsConnection>
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
              </NeedsConnection>
            ) : (
              <>
                <NeedsConnection>
                  <Button size="sm" onClick={onEdit}>
                    {t('communities.board.edit')}
                  </Button>
                </NeedsConnection>
                {!request.standing && (
                  <NeedsConnection>
                    <Button
                      size="sm"
                      loading={busy === 'extend'}
                      onClick={() =>
                        void run('extend', () =>
                          extendRequest(characterId, communityId, request.id)
                        )
                      }
                    >
                      {t('communities.board.extend')}
                    </Button>
                  </NeedsConnection>
                )}
                <NeedsConnection>
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
                </NeedsConnection>
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
      <ConfirmDialog
        open={removing?.kind === 'request'}
        title={t('communities.board.admin.removeRequestTitle')}
        body={t('communities.board.admin.removeRequestBody', {
          name: request.ownerName,
          items,
        })}
        actionLabel={t('communities.board.admin.removeRequestAction')}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await removeRequest(characterId, communityId, request.id);
          onRemoved();
        }}
      />
      <ConfirmDialog
        open={removing?.kind === 'pledge'}
        title={t('communities.board.admin.removePledgeTitle', {
          name: removing?.kind === 'pledge' ? removing.name : '',
        })}
        body={t('communities.board.admin.removePledgeBody')}
        actionLabel={t('communities.board.admin.removePledgeAction')}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing?.kind !== 'pledge') return;
          await removePledge(characterId, communityId, request.id, removing.uid);
          await refreshPledges(request.id);
        }}
      />
    </SlideOver>
  );
}
