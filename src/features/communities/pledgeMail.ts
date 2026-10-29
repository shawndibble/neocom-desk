/**
 * Pledge mail: when a Member Pledges on a Request that asked for mail, one
 * in-game mail goes to the requester from the Pledger's own Character with
 * their own token (the refresh token never leaves the device). The 100-a-day
 * cap and the once-per-Pledger-per-Request rule are the server's: a slot is
 * reserved before the mail goes out, stamped once it did, and given back when
 * ESI refused it, exactly as the mail invites do (`MailInvitePanel`). A failed
 * mail never undoes the Pledge, which is saved first.
 */
import { sendMail } from '@/features/character/mail';
import { mailSafe } from '@/lib/mailSafe';
import { clipToCodePoints, MAX_MAIL_SUBJECT } from '@/engine/communities/requestMail';
import type { RequestLine } from '@/engine/communities/requests';
import { callableErrorReason } from './callableError';
import { sendAndSettle } from './mailSettle';
import {
  confirmPledgeMail,
  releasePledgeMail,
  reservePledgeMail,
  type PledgeMailReservation,
} from './pledgeMailStore';
import { formatQuantity } from './requestFormat';
import type { Translate } from '@/lib/translate';

/**
 * `sent`: out and stamped. `unsure`: ESI gave no answer, so it may have been
 * delivered and the slot stays spent. `refused`: ESI said no, nothing went out
 * and the slot was given back. `dailyCap`: not attempted, the day's mails are
 * used. `alreadyMailed`: this Pledger mailed about this Request before.
 * `failed`: the server would not reserve it.
 */
export type PledgeMailOutcome =
  'sent' | 'unsure' | 'refused' | 'dailyCap' | 'alreadyMailed' | 'failed';

export interface PledgeMailDeps {
  reserve: () => Promise<PledgeMailReservation>;
  confirm: () => Promise<void>;
  release: () => Promise<void>;
  send: (recipientCharacterId: number, subject: string, body: string) => Promise<unknown>;
}

export async function sendPledgeMail(
  input: { compose: (reservation: PledgeMailReservation) => { subject: string; body: string } },
  deps: PledgeMailDeps
): Promise<PledgeMailOutcome> {
  let reservation: PledgeMailReservation;
  try {
    reservation = await deps.reserve();
  } catch (err) {
    const reason = callableErrorReason(err);
    return reason === 'daily-cap'
      ? 'dailyCap'
      : reason === 'already-mailed'
        ? 'alreadyMailed'
        : 'failed';
  }
  const { subject, body } = input.compose(reservation);
  return sendAndSettle({
    send: () => deps.send(reservation.requesterCharacterId, subject, body),
    release: deps.release,
    confirm: deps.confirm,
  });
}

/** The real calls: the callables for the cap and ESI for the mail, from this Character. */
export function pledgeMailDeps(
  characterId: number,
  communityId: string,
  requestId: string
): PledgeMailDeps {
  const target = { communityId, requestId };
  return {
    reserve: () => reservePledgeMail(characterId, target),
    confirm: () => confirmPledgeMail(characterId, target),
    release: () => releasePledgeMail(characterId, target),
    send: (recipientId, subject, body) =>
      sendMail(
        characterId,
        [{ recipient_id: recipientId, recipient_type: 'character' }],
        subject,
        body
      ),
  };
}

/** One line of the mail: `350,000 x Reactive Metals`, with a copy's runs, ME and TE after it. */
function lineText(t: Translate, line: RequestLine): string {
  const spec =
    line.kind === 'item'
      ? []
      : [
          t(
            line.kind === 'bpc'
              ? 'communities.board.pledgeMail.copy'
              : 'communities.board.pledgeMail.original'
          ),
          ...(line.runs === undefined
            ? []
            : [t('communities.board.spec.runs', { count: line.runs })]),
          ...(line.me === undefined ? [] : [t('communities.board.spec.me', { value: line.me })]),
          ...(line.te === undefined ? [] : [t('communities.board.spec.te', { value: line.te })]),
        ];
  return t('communities.board.pledgeMail.line', {
    quantity: formatQuantity(line.quantity),
    name: mailSafe(line.name),
    spec: spec.length > 0 ? ` (${spec.join(', ')})` : '',
  });
}

/** The mail the requester gets: who Pledged, what, and where to look. `lines` carry the Pledged quantities. */
export function buildPledgeMail(
  t: Translate,
  input: {
    communityName: string;
    pledgerName: string;
    requesterName: string;
    lines: readonly RequestLine[];
    link: string;
  }
): { subject: string; body: string } {
  const community = mailSafe(input.communityName);
  const pledger = mailSafe(input.pledgerName);
  return {
    subject: clipToCodePoints(
      t('communities.board.pledgeMail.subject', { pledger, community }),
      MAX_MAIL_SUBJECT
    ),
    body: [
      t('communities.board.pledgeMail.intro', {
        requester: mailSafe(input.requesterName),
        pledger,
        community,
      }),
      input.lines.map((line) => lineText(t, line)).join('\n'),
      t('communities.board.pledgeMail.outro', { link: input.link }),
    ].join('\n\n'),
  };
}
