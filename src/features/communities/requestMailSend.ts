/**
 * Mail about a Request (issue #3810): one in-game mail per ticked Member, sent
 * from the poster's own Character with their own token (the refresh token never
 * leaves the device), every line in each. The 100-a-day cap and the
 * one-per-recipient rule are the server's: a slot is reserved before a mail
 * goes out, stamped once it did, and given back when ESI refused it, exactly as
 * the mail invites do (`MailInvitePanel`). A failed mail never undoes the
 * Request: each recipient gets a result of their own.
 */
import { sendMail } from '@/features/character/mail';
import { mailSafe } from '@/lib/mailSafe';
import type { RequestLine } from '@/engine/communities/requests';
import { callableErrorReason } from './callableError';
import { sendAndSettle } from './mailSettle';
import {
  confirmRequestMail,
  releaseRequestMail,
  reserveRequestMail,
  type RequestMailReservation,
} from './requestMailStore';
import { formatQuantity } from './requestFormat';

export interface RequestMailRecipient {
  uid: string;
  characterId: number;
  name: string;
}

/**
 * `sent`: out and stamped. `unsure`: ESI gave no answer, so it may have been
 * delivered and the slot stays spent. `refused`: ESI said no, nothing went out
 * and the slot was given back. `dailyCap`: not attempted, the day's mails are
 * used. `alreadyMailed`: this Member was mailed about this Request before.
 * `failed`: the server would not reserve it.
 */
export type RequestMailOutcome =
  'sent' | 'unsure' | 'refused' | 'dailyCap' | 'alreadyMailed' | 'failed';

export interface RequestMailResult extends RequestMailRecipient {
  outcome: RequestMailOutcome;
}

export interface RequestMailDeps {
  reserve: (target: RequestMailRecipient) => Promise<RequestMailReservation>;
  confirm: (target: RequestMailRecipient) => Promise<void>;
  release: (target: RequestMailRecipient) => Promise<void>;
  send: (characterId: number, subject: string, body: string) => Promise<unknown>;
}

export async function sendRequestMails(
  input: {
    communityId: string;
    requestId: string;
    recipients: readonly RequestMailRecipient[];
    compose: (reservation: RequestMailReservation) => { subject: string; body: string };
    onResult?: (result: RequestMailResult) => void;
  },
  deps: RequestMailDeps
): Promise<RequestMailResult[]> {
  const results: RequestMailResult[] = [];
  const record = (recipient: RequestMailRecipient, outcome: RequestMailOutcome) => {
    const result = { ...recipient, outcome };
    results.push(result);
    input.onResult?.(result);
  };
  let capped = false;
  for (const recipient of input.recipients) {
    if (capped) {
      record(recipient, 'dailyCap');
      continue;
    }
    let reservation: RequestMailReservation;
    try {
      reservation = await deps.reserve(recipient);
    } catch (err) {
      const reason = callableErrorReason(err);
      if (reason === 'daily-cap') capped = true;
      record(
        recipient,
        reason === 'daily-cap'
          ? 'dailyCap'
          : reason === 'already-mailed'
            ? 'alreadyMailed'
            : 'failed'
      );
      continue;
    }
    const { subject, body } = input.compose(reservation);
    record(
      recipient,
      await sendAndSettle({
        send: () => deps.send(recipient.characterId, subject, body),
        release: () => deps.release(recipient),
        confirm: () => deps.confirm(recipient),
      })
    );
  }
  return results;
}

/** The real calls: the callables for the cap and ESI for the mail, from this Character. */
export function requestMailDeps(
  characterId: number,
  communityId: string,
  requestId: string
): RequestMailDeps {
  const target = (r: RequestMailRecipient) => ({
    communityId,
    requestId,
    targetCharacterId: r.characterId,
    targetName: r.name,
  });
  return {
    reserve: (r) => reserveRequestMail(characterId, target(r)),
    confirm: (r) => confirmRequestMail(characterId, target(r)),
    release: (r) => releaseRequestMail(characterId, target(r)),
    send: (recipientId, subject, body) =>
      sendMail(
        characterId,
        [{ recipient_id: recipientId, recipient_type: 'character' }],
        subject,
        body
      ),
  };
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** One line of the mail: `350,000 x Reactive Metals`, with a copy's runs, ME and TE after it. */
function lineText(t: Translate, line: RequestLine): string {
  const spec =
    line.kind === 'item'
      ? []
      : [
          t(
            line.kind === 'bpc'
              ? 'communities.board.requestMail.copy'
              : 'communities.board.requestMail.original'
          ),
          ...(line.runs === undefined
            ? []
            : [t('communities.board.spec.runs', { count: line.runs })]),
          ...(line.me === undefined ? [] : [t('communities.board.spec.me', { value: line.me })]),
          ...(line.te === undefined ? [] : [t('communities.board.spec.te', { value: line.te })]),
        ];
  return t('communities.board.requestMail.line', {
    quantity: formatQuantity(line.quantity),
    name: mailSafe(line.name),
    spec: spec.length > 0 ? ` (${spec.join(', ')})` : '',
  });
}

/** The mail one recipient gets: the whole list, where, on what terms, and where to answer. */
export function buildRequestMail(
  t: Translate,
  input: {
    communityName: string;
    requesterName: string;
    location: string;
    terms: string;
    lines: readonly RequestLine[];
    link: string;
  }
): { subject: string; body: string } {
  const community = mailSafe(input.communityName);
  const parts = [
    t('communities.board.requestMail.intro', {
      requester: mailSafe(input.requesterName),
      community,
    }),
    input.lines.map((line) => lineText(t, line)).join('\n'),
  ];
  if (input.location)
    parts.push(t('communities.board.requestMail.location', { location: mailSafe(input.location) }));
  if (input.terms)
    parts.push(t('communities.board.requestMail.terms', { terms: mailSafe(input.terms) }));
  parts.push(t('communities.board.requestMail.outro', { link: input.link }));
  return {
    subject: t('communities.board.requestMail.subject', {
      requester: mailSafe(input.requesterName),
    }),
    body: parts.join('\n\n'),
  };
}
