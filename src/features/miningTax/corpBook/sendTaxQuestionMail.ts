import {
  composeTaxQuestionMail,
  type TaxQuestionMailInput,
} from '@/engine/corpTaxBook/taxQuestionMail';
import { taxMailRecipients } from '@/engine/corpTaxBook/taxContact';
import type { TaxContact } from '@/engine/corpTaxBook/bookDocs';
import { requiredScopesForEndpoints } from '@/esi/registry';
import { loadCorporationCeoId } from '@/features/corp/members';
import { sendMail, loadMailingLists } from '@/features/character/mail';
import { canSendMail } from '@/features/corpTaxBook/officerMail';
import { isDefiniteRejection } from '@/features/communities/mailSettle';
import { loadGrantedScopes } from '@/app/grantedScopes';

const READ_LISTS_SCOPES = requiredScopesForEndpoints(['getCharacterMailingLists']);

export type TaxQuestionMailOutcome =
  | { status: 'sent'; to: number[]; fellBackToCeo: boolean }
  | { status: 'no-scope' }
  | { status: 'no-recipient' }
  | { status: 'failed'; definite: boolean };

async function senderListIds(characterId: number, scopes: readonly string[]): Promise<number[]> {
  if (!READ_LISTS_SCOPES.every((s) => scopes.includes(s))) return [];
  try {
    const lists = await loadMailingLists(characterId);
    return (lists.cached?.data ?? []).map((l) => l.mailing_list_id);
  } catch {
    return [];
  }
}

export async function sendTaxQuestionMail(args: {
  characterId: number;
  corporationId: number;
  contact: TaxContact | undefined;
  input: TaxQuestionMailInput;
}): Promise<TaxQuestionMailOutcome> {
  const { characterId, corporationId, contact, input } = args;
  const scopes = [...(await loadGrantedScopes(characterId))];
  if (!canSendMail(scopes)) return { status: 'no-scope' };

  const [ceoId, listIds] = await Promise.all([
    contact?.kind === 'characters' ? Promise.resolve(null) : loadCorporationCeoId(corporationId),
    contact?.kind === 'mailingList' ? senderListIds(characterId, scopes) : [],
  ]);
  const needsCeo = contact?.kind === 'characters' && contact.ids.every((id) => id === characterId);
  const { recipients, fellBackToCeo } = taxMailRecipients({
    contact,
    ceoId: needsCeo ? await loadCorporationCeoId(corporationId) : ceoId,
    senderId: characterId,
    senderListIds: listIds,
  });
  if (recipients.length === 0) return { status: 'no-recipient' };

  const { subject, body } = composeTaxQuestionMail(input);
  try {
    await sendMail(
      characterId,
      recipients.map((r) => ({ recipient_id: r.id, recipient_type: r.type })),
      subject,
      body
    );
  } catch (err) {
    return { status: 'failed', definite: isDefiniteRejection(err) };
  }
  return { status: 'sent', to: recipients.map((r) => r.id), fellBackToCeo };
}
