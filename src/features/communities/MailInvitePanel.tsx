import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { Field, Fields, TextInput, NeedsConnection, Button } from '@/components/ui';
import { SEND_MAIL_ENDPOINTS } from '@/esi/registry';
import { sendMail } from '@/features/character/mail';
import { resolvePilotByName } from '@/features/travel/pilotLookup';
import { mailSafe } from '@/lib/mailSafe';
import { callableErrorReason } from './callableError';
import { sendAndSettle } from './mailSettle';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import {
  communityInviteUrl,
  confirmMailInvite,
  loadMailInviteStatus,
  releaseMailInvite,
  reserveMailInvite,
  type CommunitySummary,
  type SentMailInvite,
} from './communityStore';

type Problem =
  | 'notFound'
  | 'lookupFailed'
  | 'self'
  | 'alreadyInvited'
  | 'dailyCap'
  | 'sendFailed'
  | 'sendUnsure';

/**
 * Invite by in-game mail (issue #3604): the admin types a Character name, the
 * app looks it up and mails that Character the Community's invite link from the
 * admin's own Character. A fixed template, no free text. The server holds the
 * cap (20 a day, one mail per target per Community): the slot is reserved
 * before the mail goes out and given back if it fails. The result is a
 * time-stamped "Sent" and nothing more — ESI offers no read receipt.
 */
export function MailInvitePanel({
  community,
  characterId,
}: {
  community: CommunitySummary;
  characterId: number;
}) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const inputId = useId();
  const lacksScope = useCharacterLacksEndpoints(characterId, SEND_MAIL_ENDPOINTS);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [sent, setSent] = useState<SentMailInvite[]>([]);
  const [reload, setReload] = useState(0);
  const [lastSent, setLastSent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await loadMailInviteStatus(characterId, community.id);
        if (cancelled) return;
        setRemaining(status.remaining);
        setSent(status.sent);
      } catch {
        // The counter is a convenience: the server enforces the cap either way.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, community.id, reload]);

  const send = useCallback(async () => {
    const typed = name.trim();
    if (!typed || !community.inviteCode) return;
    setBusy(true);
    setProblem(null);
    setLastSent(null);
    try {
      let target;
      try {
        target = await resolvePilotByName(typed);
      } catch {
        setProblem('lookupFailed');
        return;
      }
      if (!target) {
        setProblem('notFound');
        return;
      }
      if (target.characterId === characterId) {
        setProblem('self');
        return;
      }

      let reservation;
      try {
        reservation = await reserveMailInvite(
          characterId,
          community.id,
          target.characterId,
          target.name
        );
      } catch (err) {
        const reason = callableErrorReason(err);
        setProblem(
          reason === 'already-invited'
            ? 'alreadyInvited'
            : reason === 'daily-cap'
              ? 'dailyCap'
              : 'sendFailed'
        );
        return;
      }

      const settled = await sendAndSettle({
        send: () =>
          sendMail(
            characterId,
            [{ recipient_id: target.characterId, recipient_type: 'character' }],
            t('communities.mailInvite.subject', { community: mailSafe(reservation.communityName) }),
            t('communities.mailInvite.body', {
              admin: mailSafe(reservation.adminName),
              community: mailSafe(reservation.communityName),
              link: communityInviteUrl(reservation.inviteCode),
            })
          ),
        // ESI refused it: nothing went out, so give the slot and the day's count back.
        release: () =>
          releaseMailInvite(characterId, community.id, target.characterId, target.name),
        confirm: () =>
          confirmMailInvite(characterId, community.id, target.characterId, target.name),
      });
      if (settled !== 'sent') {
        // A timeout or server error: the mail may have been delivered, so the slot stays spent.
        setProblem(settled === 'refused' ? 'sendFailed' : 'sendUnsure');
        return;
      }
      setRemaining(reservation.remaining);
      setLastSent(target.name);
      setName('');
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }, [name, community.id, community.inviteCode, characterId, t]);

  const disabled = busy || lacksScope || remaining === 0;

  return (
    <section className="mb-4 space-y-2" aria-label={t('communities.mailInvite.title')}>
      <h3 className="text-xs font-semibold">{t('communities.mailInvite.title')}</h3>
      <p className="text-xs text-text-dim">{t('communities.mailInvite.hint')}</p>
      <GrantNote
        characterId={characterId}
        endpoints={SEND_MAIL_ENDPOINTS}
        title={t('communities.mailInvite.grantTitle')}
        hint={t('communities.mailInvite.grantHint')}
        actionLabel={t('communities.mailInvite.grantAction')}
      />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Fields>
          <Field label={t('communities.mailInvite.nameLabel')} htmlFor={inputId}>
            <TextInput
              id={inputId}
              size="sm"
              className="w-56"
              value={name}
              disabled={disabled}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        </Fields>
        <NeedsConnection>
          <Button type="submit" size="sm" loading={busy} disabled={disabled || name.trim() === ''}>
            {t('communities.mailInvite.send')}
          </Button>
        </NeedsConnection>
      </form>
      {remaining !== null && (
        <p role="status" className="text-xs text-text-dim">
          {t('communities.mailInvite.remaining', { count: remaining })}
        </p>
      )}
      {lastSent && (
        <p role="status" className="text-xs text-text-dim">
          {t('communities.mailInvite.sentTo', { name: lastSent })}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-xs text-danger">
          {t(`communities.mailInvite.problem.${problem}`)}
        </p>
      )}
      {sent.length > 0 && (
        <ul
          className="divide-y divide-line text-xs"
          aria-label={t('communities.mailInvite.sentList')}
        >
          {sent.map((invite) => (
            <li key={invite.targetCharacterId} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate">{invite.targetName}</span>
              <span className="text-text-dim">
                {t('communities.mailInvite.sentAt', {
                  when: formatTimestamp(new Date(invite.sentAt), timeZone),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
