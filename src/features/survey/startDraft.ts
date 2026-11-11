/**
 * What the empty Survey page's Additional information boxes hold before the first
 * scan (`SurveyStartDetails`), and how it becomes the new Survey's prefill, the same
 * way a start link's details do.
 */
import type { InfoFields, InfoTemplate } from '@/engine/survey/infoTemplate';
import { parseTaxPct } from './moonTaxPayee';

export interface StartDraft {
  place: { id: number | null; name: string } | null;
  payeeName: string;
  rateText: string;
  notes: string;
}

export const EMPTY_START_DRAFT: StartDraft = {
  place: null,
  payeeName: '',
  rateText: '',
  notes: '',
};

export function draftFromTemplate(template: InfoTemplate): StartDraft {
  return {
    place: template.location ?? null,
    payeeName: template.tax?.name ?? '',
    rateText: template.tax ? String(template.tax.pct) : '',
    notes: template.notes ?? '',
  };
}

/** The draft as a new Survey stores it: the tax only once it has a name and a valid rate. */
export function draftToInfo(draft: StartDraft): InfoFields {
  const pct = parseTaxPct(draft.rateText);
  const name = draft.payeeName.trim();
  return {
    location: draft.place,
    tax: name !== '' && pct !== null ? { name, pct } : null,
    notes: draft.notes.trim(),
  };
}
