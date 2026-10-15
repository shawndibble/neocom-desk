import { useEffect, useMemo, useState } from 'react';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import {
  MAX_REQUEST_MAILS_PER_DAY,
  requestMailsLeft,
  requestRecipients,
  type RequestLine,
  type RequestRecipient,
} from '@/engine/communities/requests';
import { characterIdForUid } from '@/sync/uid';
import { loadMemberLibraries, type CommunityMember } from './communityStore';
import type { RequestMailRecipient } from './requestMailSend';
import { loadRequestMailsToday } from './requestMailStore';

export const SEND_MAIL = ['postCharacterMail'] as const;

export interface ComposeRecipientsState {
  characterId: number;
  recipients: readonly RequestRecipient[];
  ticked: RequestMailRecipient[];
  isTicked: (recipient: RequestRecipient) => boolean;
  setTicked: (uid: string, ticked: boolean) => void;
  lacksScope: boolean;
  ready: boolean;
  librariesFailed: boolean;
  mailsToday: number | null;
  mailsUnknown: boolean;
  mailsLeft: number;
}

/**
 * Who a new Request is mailed to (issue #3810), as the compose dialog's own
 * state. The requester's own character is ticked from the start, so the
 * Request lands in their own mail too, along with the Members sharing a
 * matching blueprint and any `tickedUids` a caller names; the pilot adds or
 * removes anyone. The day's mail count is read so the dialog can warn before
 * the daily cap.
 */
export function useComposeRecipients({
  characterId,
  communityId,
  myUid,
  members,
  lines,
  tickedUids,
  enabled = true,
}: {
  characterId: number;
  communityId: string;
  myUid: string;
  members: readonly CommunityMember[] | null;
  lines: readonly RequestLine[];
  tickedUids?: readonly string[];
  /** False when nothing is mailed (editing a Request): no reads are made. */
  enabled?: boolean;
}): ComposeRecipientsState {
  // Only the Members the pilot ticked or unticked; the rest follow the defaults.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [libraries, setLibraries] = useState<Awaited<
    ReturnType<typeof loadMemberLibraries>
  > | null>(null);
  const [librariesFailed, setLibrariesFailed] = useState(false);
  const [mailsToday, setMailsToday] = useState<number | null>(null);
  const [mailsUnknown, setMailsUnknown] = useState(false);
  const lacksScope = useCharacterLacksEndpoints(characterId, SEND_MAIL);

  const needsLibraries = enabled && lines.some((line) => line.kind !== 'item');
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
    if (!enabled) return;
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
  }, [enabled, characterId]);

  const recipients = useMemo(
    () => requestRecipients(lines, members ?? [], libraries ?? [], myUid),
    [lines, members, libraries, myUid]
  );
  const isTicked = (r: RequestRecipient) =>
    !lacksScope &&
    (toggled[r.uid] ?? (r.self || r.shared > 0 || (tickedUids?.includes(r.uid) ?? false)));
  const ticked = recipients.flatMap((r): RequestMailRecipient[] => {
    const id = characterIdForUid(r.uid);
    return id !== null && isTicked(r)
      ? [{ uid: r.uid, characterId: id, name: r.characterName }]
      : [];
  });
  return {
    characterId,
    recipients,
    ticked,
    isTicked,
    setTicked: (uid, on) => setToggled((cur) => ({ ...cur, [uid]: on })),
    lacksScope,
    ready:
      members !== null &&
      (mailsToday !== null || mailsUnknown) &&
      (!needsLibraries || libraries !== null || librariesFailed),
    librariesFailed,
    mailsToday,
    mailsUnknown,
    mailsLeft: mailsToday === null ? MAX_REQUEST_MAILS_PER_DAY : requestMailsLeft(mailsToday),
  };
}
