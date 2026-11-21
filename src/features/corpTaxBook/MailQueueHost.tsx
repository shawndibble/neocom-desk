import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { usePageHeaderSlot } from '@/components/ui/pageHeaderSlot';
import { db } from '@/db';
import {
  isLateNoticeMail,
  removalNoticeStillDue,
  startsRemovalClock,
  staleMailSpell,
  type MailQueueItem,
} from '@/engine/corpTaxBook/mailQueue';
import { fillTakesEffect, removalTakesEffectAt } from '@/engine/corpTaxBook/removalMail';
import { isOfflineFailure, isUnconfirmedWrite } from '@/esi/client';
import { sendMail } from '@/features/character/mail';
import { openNewMail } from '@/features/openInEve/sendOpenNewMail';
import { MailQueueChip } from './MailQueueChip';
import { retryMail } from './mailQueue';
import { runMailQueue, type QueueDeps } from './mailQueueRunner';
import { clearSent, listQueue, saveItems } from './mailQueueStore';

function liveDeps(sending: (id: string | undefined) => void): QueueDeps {
  return {
    now: Date.now,
    random: Math.random,
    list: () => listQueue(),
    save: saveItems,
    send: async (item) => {
      // The recorded time once the clock runs (re-read: a log earlier in this step may have
      // just stamped it); else 24 hours from this send, which starts it.
      const body =
        item.kind === 'removal'
          ? fillTakesEffect(
              item.body,
              removalTakesEffectAt((await db.corpMailQueue.get(item.id)) ?? item, Date.now())
            )
          : item.body;
      return sendMail(
        item.senderCharacterId,
        [{ recipient_id: item.recipientId, recipient_type: 'character' }],
        item.subject,
        body
      );
    },
    log: async (item) => {
      if (item.kind === 'removalCancelled') return;
      if (item.kind === 'removal') {
        // Only a copy to the moon owner's CEO or payee starts the 24 hours.
        if (!startsRemovalClock(item)) return;
        const { recordRemovalNoticeSent } = await import('@/features/corp/moons/removalFlow');
        await recordRemovalNoticeSent(
          item.senderCharacterId,
          item.corporationId,
          item.feederCorporationId!,
          item.sentAt
        );
        return;
      }
      // A sent stale-ledger copy makes this officer's claim final, so no other officer mails the
      // spell again (#6210); unmarked, the claim lapses and another officer's client sends it.
      const spell = staleMailSpell(item);
      if (spell) {
        const { markFeederStaleMailSent } = await import('@/features/corp/taxBook/feederClient');
        await markFeederStaleMailSent(
          item.senderCharacterId,
          item.corporationId,
          spell.feederCorporationId,
          spell.staleSince
        );
        return;
      }
      // A rate-change mail has no late notice to log on; the rate change is already in the audit trail.
      if (!isLateNoticeMail(item.kind)) return;
      const { recordLateNoticeMail } = await import('@/features/corp/taxBook/bookClient');
      await recordLateNoticeMail(item.senderCharacterId, item.corporationId, {
        noticeId: item.statementId,
        mailId: item.mailId!,
        kind: item.kind === 'reminder' ? 'reminder' : 'notice',
      });
    },
    sending,
    isUnconfirmed: isUnconfirmedWrite,
    // Another officer's cancel (or a Leave, a forced removal, a disconnect) never reaches this
    // browser's queue: re-read the removal before mailing "removing you" (#4621).
    isStillDue: async (item) => {
      if (item.kind !== 'removal' || item.feederCorporationId === undefined) return true;
      const { readFeederRemovalState } = await import('@/features/corp/taxBook/bookClient');
      const record = await readFeederRemovalState(
        item.senderCharacterId,
        item.corporationId,
        item.feederCorporationId
      );
      return removalNoticeStillDue(item, record);
    },
    drop: async (ids) => db.corpMailQueue.bulkDelete([...ids]),
  };
}

/**
 * Runs the Corp Tax Book send queue and shows its chip (D16, issue #4064).
 * Mounted in the shell only while the queue has rows (`MailQueueMount`), so a
 * pilot with no Corp Tax Book mail pays nothing for it. Every open tab with
 * mail waiting tries to work the queue; the Web Lock (`runMailQueue`) lets
 * one of them.
 */
export default function MailQueueHost() {
  const { t } = useTranslation();
  const { element: slot } = usePageHeaderSlot();
  const items = useLiveQuery(() => listQueue(), [], [] as MailQueueItem[]);
  const [sendingId, setSendingId] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());
  const hasWaiting = items.some(
    (i) => i.status === 'waiting' || (i.status === 'sent' && !i.logged)
  );

  // Work the queue while something is waiting. When another tab holds the lock
  // this tab looks again every 15 s, so a closed worker tab hands over.
  useEffect(() => {
    if (!hasWaiting) return;
    const controller = new AbortController();
    const deps = liveDeps(setSendingId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      const ran = await runMailQueue(deps, controller.signal, {
        locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
        isOffline: isOfflineFailure,
      });
      if (!ran && !controller.signal.aborted) timer = setTimeout(() => void attempt(), 15_000);
    };
    void attempt();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [hasWaiting]);

  // A once-a-second clock for the countdown, only while there is something to count.
  useEffect(() => {
    if (!hasWaiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasWaiting]);

  const onRetry = useCallback((item: MailQueueItem) => void retryMail(item), []);
  const onOpenInEve = useCallback(
    async (item: MailQueueItem) => {
      const result = await openNewMail(item.senderCharacterId, {
        recipientId: item.recipientId,
        subject: item.subject,
        body: item.body,
      });
      if (result.ok) return t('openInEve.opened');
      if ('offline' in result && result.offline) return t('openInEve.offline');
      return t('openInEve.failed', { message: result.message ?? t('openInEve.unknownError') });
    },
    [t]
  );

  if (items.length === 0) return null;
  const chip = (
    <MailQueueChip
      items={items}
      now={now}
      sendingId={sendingId}
      onRetry={onRetry}
      onOpenInEve={onOpenInEve}
      onClearSent={() => void clearSent()}
    />
  );
  // In the page header's slot when the page has one; else the old row above the page.
  return slot ? createPortal(chip, slot) : <div className="mb-2 flex justify-end">{chip}</div>;
}
