import { useEffect, useMemo, useRef, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import {
  SlideOver,
  NeedsConnection,
  Button,
  ToastStack,
  useDeferredCommits,
} from '@/components/ui';
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
import { Well } from '@/components/ui/Well';
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

export function RequestPanel({
  request,
  mine,
  myUid,
  pledges: allPledges,
  now,
  characterId,
  communityId,
  communityName,
  isAdmin,
  memberNames,
  onClose,
  onChanged,
  onEdit,
  onRemove,
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
  isAdmin: boolean;
  memberNames: ReadonlyMap<string, string>;
  onClose: () => void;
  onChanged: () => void;
  onEdit: () => void;
  onRemove: (removal: { message: string; commit: () => Promise<void> }) => void;
  refreshPledges: (requestId: string) => Promise<RequestPledge[]>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'extend' | 'close' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pledgeBusy, setPledgeBusy] = useState<string | null>(null);
  const [pledgeError, setPledgeError] = useState<string | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  const [mailOutcome, setMailOutcome] = useState<PledgeMailOutcome | null>(null);
  const mailSettled = useRef(false);
  const pendingPledgeRemovals = useDeferredCommits();
  const pledges = useMemo(
    () => allPledges.filter((p) => !pendingPledgeRemovals.hiddenIds.has(p.uid)),
    [allPledges, pendingPledgeRemovals.hiddenIds]
  );

  useEffect(() => {
    refreshPledges(request.id).catch(() =>
      setPledgeError(t('communities.board.pledgesLoadFailed'))
    );
  }, [request.id, refreshPledges, t]);

  const myPledge = pledges.find((p) => p.uid === myUid);
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
  const contractBuyerId = buyerOf(request);
  const isBuyerView = request.standing !== undefined && (mine || contractBuyerId === characterId);
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
      contentKey={request.id}
      title={
        mine
          ? t('communities.board.panelTitleMine')
          : t('communities.board.panelTitle', { name: request.ownerName })
      }
      subtitle={[place, posted, closes].filter(Boolean).join(' · ')}
    >
      <div className="space-y-3 text-sm">
        {request.terms && (
          <Well as="p" size="wide" className="text-xs">
            <span className="text-text-dim">{t('communities.board.termsLabel')} </span>
            {request.terms}
          </Well>
        )}
        {request.standing && (
          <Well
            as="section"
            size="wide"
            aria-label={t('communities.board.buyback.termsLabel')}
            className="space-y-2"
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
          </Well>
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
        {pledgeError && <InlineError>{pledgeError}</InlineError>}
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
                        onClick={() =>
                          pendingPledgeRemovals.defer({
                            id: pledge.uid,
                            message: t('communities.board.admin.pledgeRemoved', { name }),
                            commit: async () => {
                              await removePledge(characterId, communityId, request.id, pledge.uid);
                              await refreshPledges(request.id);
                            },
                          })
                        }
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
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  onRemove({
                    message: t('communities.board.admin.requestRemoved', {
                      name: request.ownerName,
                    }),
                    commit: () => removeRequest(characterId, communityId, request.id),
                  })
                }
              >
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
        {error && <InlineError>{error}</InlineError>}
      </div>
      <ToastStack
        items={pendingPledgeRemovals.items}
        undoLabel={t('communities.board.admin.undo')}
        onUndo={pendingPledgeRemovals.undo}
        onClose={pendingPledgeRemovals.commit}
      />
    </SlideOver>
  );
}
