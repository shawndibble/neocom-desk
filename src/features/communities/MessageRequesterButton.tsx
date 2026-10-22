import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { Button } from '@/components/ui';
import { OUTCOME_VISIBLE_MS } from '@/features/openInEve/useOpenInEve';
import { OPEN_NEW_MAIL_ENDPOINTS, openNewMail } from '@/features/openInEve/sendOpenNewMail';
import { useOnline } from '@/stores/network';

type Outcome = { tone: 'status' | 'alert'; text: string } | null;

/**
 * "Message <name>…" in a Request's side panel: opens the EVE client's new-mail
 * window addressed to the requester, subject and body filled in (an ESI
 * open-window call; nothing is sent until the pilot presses Send in game, and
 * it counts against no mail cap). The call needs the Open in EVE Permission.
 * A Character without it doesn't see the button at all. A refusal from ESI
 * (the pilot is not in game) is said beside it.
 */
export function MessageRequesterButton({
  characterId,
  recipientId,
  name,
  subject,
  body,
}: {
  /** The viewer's Character: whose client opens the window. */
  characterId: number;
  /** The requester's Character id: who the mail is to. */
  recipientId: number;
  name: string;
  subject: string;
  body: string;
}) {
  const { t } = useTranslation();
  const reasonId = useId();
  const lacksScope = useCharacterLacksEndpoints(characterId, OPEN_NEW_MAIL_ENDPOINTS);
  const online = useOnline();
  /** Offline is the reason only when the missing Permission is not already. */
  const offlineBlocked = !online && !lacksScope;
  const blocked = lacksScope || offlineBlocked;
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  /** `sending` lags a render behind; two quick presses must not both send. */
  const inFlight = useRef(false);

  useEffect(() => {
    if (outcome === null) return;
    const timer = setTimeout(() => setOutcome(null), OUTCOME_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [outcome]);

  const send = async () => {
    if (blocked || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setOutcome(null);
    try {
      const result = await openNewMail(characterId, { recipientId, subject, body });
      if (result.ok) {
        setOutcome({ tone: 'status', text: t('openInEve.opened') });
      } else if (result.offline) {
        setOutcome({
          tone: 'alert',
          text: result.unconfirmed ? t('openInEve.unconfirmed') : t('openInEve.offline'),
        });
      } else if (!result.needsPermission) {
        setOutcome({
          tone: 'alert',
          text: t('openInEve.failed', { message: result.message ?? t('openInEve.unknownError') }),
        });
      }
      // needsPermission: the grant just turned out to lack the scope; the live
      // check above now reads true and the button hides.
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  if (lacksScope) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        loading={sending}
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? reasonId : undefined}
        onClick={() => void send()}
      >
        {t('communities.board.message', { name })}
      </Button>
      {offlineBlocked && (
        <span id={reasonId} className="text-xs text-text-dim">
          {t('common.needsConnection')}
        </span>
      )}
      {outcome && (
        <span
          role={outcome.tone}
          className={outcome.tone === 'alert' ? 'text-xs text-danger' : 'text-xs text-success'}
        >
          {outcome.text}
        </span>
      )}
    </div>
  );
}
