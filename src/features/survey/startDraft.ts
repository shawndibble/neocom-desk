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

export function draftToInfo(draft: StartDraft): InfoFields {
  const pct = parseTaxPct(draft.rateText);
  const name = draft.payeeName.trim();
  return {
    location: draft.place,
    tax: name !== '' && pct !== null ? { name, pct } : null,
    notes: draft.notes.trim(),
  };
}
