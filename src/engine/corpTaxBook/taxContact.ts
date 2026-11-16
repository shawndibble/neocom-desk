/**
 * Who a member's tax question is mailed to (the book's `taxContact` setting). Pure; the
 * sender and the lists they joined are the caller's to look up.
 */
import type { TaxContact } from './bookDocs';

export interface TaxMailRecipient {
  id: number;
  type: 'character' | 'mailing_list';
}

/**
 * Who a member's tax question is mailed to. A mailing list only when the sender is on it (EVE
 * delivers to a list only from its members), else the CEO; named officers each; nothing set → CEO.
 * The sender is never mailed themselves. Empty when no CEO is known and nothing else applies.
 * `fellBackToCeo` is true when a set contact could not be used and the CEO is mailed instead.
 */
export function taxMailRecipients(input: {
  contact: TaxContact | undefined;
  ceoId: number | null;
  senderId: number;
  senderListIds: readonly number[];
}): { recipients: TaxMailRecipient[]; fellBackToCeo: boolean } {
  const { contact, ceoId, senderId } = input;
  const ceo: TaxMailRecipient[] =
    ceoId !== null && ceoId !== senderId ? [{ id: ceoId, type: 'character' }] : [];

  if (contact?.kind === 'mailingList' && input.senderListIds.includes(contact.id)) {
    return { recipients: [{ id: contact.id, type: 'mailing_list' }], fellBackToCeo: false };
  }
  if (contact?.kind === 'characters') {
    const named = [...new Set(contact.ids)].filter((id) => id !== senderId);
    if (named.length > 0) {
      return {
        recipients: named.map((id) => ({ id, type: 'character' as const })),
        fellBackToCeo: false,
      };
    }
  }
  return { recipients: ceo, fellBackToCeo: contact !== undefined && ceo.length > 0 };
}
