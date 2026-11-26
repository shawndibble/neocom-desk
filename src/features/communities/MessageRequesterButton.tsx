import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OutcomeNote, type Outcome } from '@/components/OutcomeNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { Button } from '@/components/ui';
import { OUTCOME_VISIBLE_MS } from '@/features/openInEve/useOpenInEve';
import { OPEN_NEW_MAIL_ENDPOINTS, openNewMail } from '@/features/openInEve/sendOpenNewMail';
import { useOnline } from '@/stores/network';

export function MessageRequesterButton({
  characterId,
  recipientId,
  name,
  subject,
  body,
}: {
  characterId: number;
  recipientId: number;
  name: string;
  subject: string;
  body: string;
}) {
  const { t } = useTranslation();
  const reasonId = useId();
  const lacksScope = useCharacterLacksEndpoints(characterId, OPEN_NEW_MAIL_ENDPOINTS);
  const online = useOnline();
  const offlineBlocked = !online && !lacksScope;
  const blocked = lacksScope || offlineBlocked;
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
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
      <OutcomeNote outcome={outcome} />
    </div>
  );
}
