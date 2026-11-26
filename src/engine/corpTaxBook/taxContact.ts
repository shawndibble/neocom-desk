import type { TaxContact } from './bookDocs';

export interface TaxMailRecipient {
  id: number;
  type: 'character' | 'mailing_list';
}

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
