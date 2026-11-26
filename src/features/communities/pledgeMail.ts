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
