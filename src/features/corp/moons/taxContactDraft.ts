import type { TaxContact } from '@/engine/corpTaxBook/bookDocs';

export type TaxContactMode = 'ceo' | 'list' | 'officers';

export interface TaxContactDraft {
  mode: TaxContactMode;
  listId: number | null;
  listName: string;
  officerIds: number[];
}

export function draftFromContact(contact: TaxContact | undefined): TaxContactDraft {
  if (contact?.kind === 'mailingList') {
    return { mode: 'list', listId: contact.id, listName: contact.name, officerIds: [] };
  }
  if (contact?.kind === 'characters') {
    return { mode: 'officers', listId: null, listName: '', officerIds: contact.ids };
  }
  return { mode: 'ceo', listId: null, listName: '', officerIds: [] };
}

export function contactFromDraft(draft: TaxContactDraft): TaxContact | undefined {
  if (draft.mode === 'list' && draft.listId !== null) {
    return { kind: 'mailingList', id: draft.listId, name: draft.listName };
  }
  if (draft.mode === 'officers' && draft.officerIds.length > 0) {
    return { kind: 'characters', ids: draft.officerIds };
  }
  return undefined;
}

const sameContact = (a: TaxContact | undefined, b: TaxContact | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function taxContactPatch(
  draft: TaxContactDraft,
  stored: TaxContact | undefined
): { taxContact?: TaxContact | null } {
  const next = contactFromDraft(draft);
  if (sameContact(next, stored)) return {};
  return { taxContact: next ?? null };
}
