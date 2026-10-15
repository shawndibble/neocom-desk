import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { Button, Checkbox, Spinner } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import {
  MAX_REQUEST_MAILS_PER_DAY,
  requestMailsLeft,
  requestRecipients,
  type RequestLine,
} from '@/engine/communities/requests';
import { cx } from '@/lib/cx';
import { characterIdForUid } from '@/sync/uid';
import { loadMemberLibraries, type CommunityMember } from './communityStore';
import type {
  RequestMailOutcome,
  RequestMailRecipient,
  RequestMailResult,
} from './requestMailSend';
import { loadRequestMailsToday } from './requestStore';

const SEND_MAIL = ['postCharacterMail'] as const;

/**
 * Compose step 2 (issue #3810): who to mail. The Members sharing a matching
 * blueprint are pre-ticked (plus any `tickedUids` a caller names), the day's
 * mail count is read, and the button posts with the ticked Members, or with
 * none. Posting and sending are the dialog's (`onPost`).
 */
export function ComposeRecipientsStep({
  characterId,
  communityId,
  myUid,
  members,
  lines,
  tickedUids,
  busy,
  error,
  onBack,
  onPost,
}: {
  characterId: number;
  communityId: string;
  myUid: string;
  members: readonly CommunityMember[] | null;
  lines: readonly RequestLine[];
  tickedUids?: readonly string[];
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onPost: (recipients: RequestMailRecipient[]) => void;
}) {
  const { t } = useTranslation();
  // Only the Members the pilot ticked or unticked; the rest follow the match.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [libraries, setLibraries] = useState<Awaited<
    ReturnType<typeof loadMemberLibraries>
  > | null>(null);
  const [librariesFailed, setLibrariesFailed] = useState(false);
  const [mailsToday, setMailsToday] = useState<number | null>(null);
  const [mailsUnknown, setMailsUnknown] = useState(false);
  const lacksScope = useCharacterLacksEndpoints(characterId, SEND_MAIL);

  const needsLibraries = lines.some((line) => line.kind !== 'item');
  useEffect(() => {
    if (!needsLibraries || !members || libraries) return;
    let cancelled = false;
    loadMemberLibraries(
      characterId,
      communityId,
      members.map((member) => member.uid),
      // A failed read must say so, not read as "nobody shares anything".
      { strict: true }
    ).then(
      (loaded) => !cancelled && setLibraries(loaded),
      () => !cancelled && setLibrariesFailed(true)
    );
    return () => {
      cancelled = true;
    };
  }, [needsLibraries, members, libraries, characterId, communityId]);
  useEffect(() => {
    let cancelled = false;
    // The count is a convenience: the server holds the cap either way.
    loadRequestMailsToday(characterId).then(
      (used) => !cancelled && setMailsToday(used),
      (err) => {
        if (cancelled) return;
        console.warn('Request mails today could not be read', err);
        setMailsUnknown(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const recipients = useMemo(
    () => requestRecipients(lines, members ?? [], libraries ?? [], myUid),
    [lines, members, libraries, myUid]
  );
  const isTicked = (uid: string, shared: number) =>
    !lacksScope && (toggled[uid] ?? (shared > 0 || (tickedUids?.includes(uid) ?? false)));
  const tickedRecipients = recipients.flatMap((r): RequestMailRecipient[] => {
    const id = characterIdForUid(r.uid);
    return id !== null && isTicked(r.uid, r.shared)
      ? [{ uid: r.uid, characterId: id, name: r.characterName }]
      : [];
  });
  const mailsLeft = mailsToday === null ? MAX_REQUEST_MAILS_PER_DAY : requestMailsLeft(mailsToday);
  const recipientsReady =
    members !== null &&
    (mailsToday !== null || mailsUnknown) &&
    (!needsLibraries || libraries || librariesFailed);

  return (
    <form
      className="space-y-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (recipientsReady && !busy) onPost(tickedRecipients);
      }}
    >
      <p className="text-xs text-text-dim">
        {mailsUnknown
          ? t('communities.board.compose.recipientsIntroUnknown')
          : t('communities.board.compose.recipientsIntro', {
              used: mailsToday ?? 0,
              max: MAX_REQUEST_MAILS_PER_DAY,
            })}
      </p>
      {lacksScope && (
        <GrantNote
          characterId={characterId}
          endpoints={SEND_MAIL}
          title={t('communities.board.compose.grantTitle')}
          hint={t('communities.board.compose.grantHint')}
          actionLabel={t('communities.board.compose.grantAction')}
        />
      )}
      {!recipientsReady ? (
        <Spinner size="sm" label={t('communities.loading')} />
      ) : recipients.length === 0 ? (
        <p className="text-xs text-text-dim">{t('communities.board.compose.recipientsNone')}</p>
      ) : (
        <ul
          aria-label={t('communities.board.compose.recipientsLabel')}
          className="divide-y divide-line rounded-xs border border-line"
        >
          {recipients.map((r) => (
            <li key={r.uid}>
              <label className={cx('flex items-center gap-2 px-3', tappableRowClassName)}>
                <Checkbox
                  checked={isTicked(r.uid, r.shared)}
                  disabled={lacksScope}
                  onChange={(e) => setToggled((cur) => ({ ...cur, [r.uid]: e.target.checked }))}
                />
                <span className="min-w-0 flex-1 truncate">{r.characterName}</span>
                {r.shared > 0 && (
                  <span className="shrink-0 text-xs text-text-dim">
                    {t('communities.board.compose.shares', { count: r.shared })}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
      {librariesFailed && (
        <p role="status" className="text-xs text-warning">
          {t('communities.board.compose.recipientsFailed')}
        </p>
      )}
      {recipientsReady && mailsLeft === 0 && (
        <p role="status" className="text-xs text-warning">
          {t('communities.board.compose.capNone')}
        </p>
      )}
      {recipientsReady && mailsLeft > 0 && tickedRecipients.length > mailsLeft && (
        <p role="status" className="text-xs text-warning">
          {t('communities.board.compose.capNote', { count: mailsLeft })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={onBack} disabled={busy}>
          {t('communities.board.compose.back')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          type="submit"
          loading={busy}
          disabled={!recipientsReady}
        >
          {tickedRecipients.length > 0
            ? t('communities.board.compose.postAndMail', { count: tickedRecipients.length })
            : t('communities.board.compose.post')}
        </Button>
      </div>
    </form>
  );
}

/** The mailing and done phases: a text result per recipient, then Done. */
export function ComposeMailResults({
  phase,
  mailed,
  mailResults,
  onClose,
}: {
  phase: 'mailing' | 'done';
  mailed: readonly RequestMailRecipient[];
  mailResults: readonly RequestMailResult[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 text-sm">
      <p role="status" className="text-xs text-text-dim">
        {phase === 'mailing'
          ? t('communities.board.compose.mailing', {
              done: mailResults.length,
              count: mailed.length,
            })
          : t('communities.board.compose.resultsSummary', {
              sent: mailResults.filter((r) => r.outcome === 'sent').length,
              count: mailed.length,
            })}
      </p>
      <ul
        aria-label={t('communities.board.compose.resultsLabel')}
        className="divide-y divide-line rounded-xs border border-line"
      >
        {mailed.map((recipient) => {
          const outcome: RequestMailOutcome | undefined = mailResults.find(
            (r) => r.uid === recipient.uid
          )?.outcome;
          return (
            <li key={recipient.uid} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate">{recipient.name}</span>
              <span className="min-w-0 text-xs text-text-dim">
                {outcome ? (
                  t(`communities.board.compose.result.${outcome}`)
                ) : (
                  <Spinner size="sm" label={t('communities.loading')} />
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <Button size="sm" variant="primary" onClick={onClose} disabled={phase === 'mailing'}>
          {t('communities.board.compose.done')}
        </Button>
      </div>
    </div>
  );
}
