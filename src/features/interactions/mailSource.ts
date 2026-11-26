import type { Interaction } from '@/engine/interactions/interactions';
import type { MailHeader } from '@/esi/endpoints/mail';
import type { Translate } from '@/lib/translate';
import { mailOpenHref } from '@/lib/highlightParam';
import { loadMailOwnerCacheOnly } from '@/features/character/mail';
import type { PersonalSource } from './sourceTypes';

export interface MailboxHeaders {
  characterId: number;
  headers: readonly MailHeader[];
}

export function mailInteractions(
  mailboxes: readonly MailboxHeaders[],
  otherId: number,
  otherName: string,
  t: Translate
): Interaction[] {
  const name = otherName;
  const out: Interaction[] = [];
  for (const { characterId, headers } of mailboxes) {
    for (const header of headers) {
      const at = header.timestamp === undefined ? Number.NaN : Date.parse(header.timestamp);
      if (!Number.isFinite(at)) continue;
      const incoming = header.from === otherId;
      const outgoing =
        header.from === characterId &&
        (header.recipients ?? []).some(
          (r) => r.recipient_type === 'character' && r.recipient_id === otherId
        );
      if (!incoming && !outgoing) continue;
      out.push({
        id: `mail-${characterId}-${header.mail_id}`,
        kind: 'mail',
        at,
        type: 'interactions.type.mail',
        tone: 'neutral',
        title: header.subject?.trim() || t('interactions.mail.noSubject'),
        detail: t(incoming ? 'interactions.mail.from' : 'interactions.mail.to', { name }),
        characterId,
        to: mailOpenHref(header.mail_id, characterId),
      });
    }
  }
  return out;
}

export const mailSource: PersonalSource = async ({ characterIds, otherId, otherName, t }) => {
  const mailboxes = await Promise.all(
    characterIds.map(async (characterId) => {
      const load = await loadMailOwnerCacheOnly(characterId);
      return { characterId, headers: load.headers?.data ?? [] };
    })
  );
  return mailInteractions(mailboxes, otherId, otherName, t);
};
