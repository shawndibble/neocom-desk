import type { InfoFields } from '@/engine/survey/infoTemplate';
import type { SurveyPlaceKind } from './surveyPlaces';
import { MAX_LOCATION_NAME, MAX_SURVEY_NOTES, MAX_TAX_NAME } from './surveyStore';

export const START_LINK_PATH = '/survey';

export interface StartLinkEntity {
  id: number | null;
  name: string;
  kind?: SurveyPlaceKind;
}

export interface StartLinkFields {
  place: StartLinkEntity | null;
  payee: StartLinkEntity | null;
  rate: number | null;
  notes: string;
}

export const EMPTY_START_LINK: StartLinkFields = {
  place: null,
  payee: null,
  rate: null,
  notes: '',
};

export function startLinkPath({ place, payee, rate, notes }: StartLinkFields): string {
  const query = new URLSearchParams();
  if (place !== null) {
    const named = place.id !== null && (place.kind === 'system' || place.kind === 'station');
    if (place.name.trim() !== '' && !named) query.set('place', place.name.trim());
    if (place.id !== null) query.set('placeId', String(place.id));
  }
  if (payee !== null) {
    if (payee.name.trim() !== '' && payee.id === null) query.set('payee', payee.name.trim());
    if (payee.id !== null) query.set('payeeId', String(payee.id));
  }
  if (rate !== null) query.set('rate', String(rate));
  if (notes.trim() !== '') query.set('notes', notes.trim());
  const search = query.toString();
  return search === '' ? START_LINK_PATH : `${START_LINK_PATH}?${search}`;
}

const POP_ID = /^[1-9][0-9]{0,15}_.{1,100}$/;

export function popOfStartLink(search: string): string | null {
  const pop = new URLSearchParams(search).get('pop');
  return pop !== null && POP_ID.test(pop) ? pop : null;
}

export function withPop(path: string, popId: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}pop=${encodeURIComponent(popId)}`;
}

function positiveInt(text: string | null): number | null {
  const value = Number(text);
  return text !== null && text.trim() !== '' && Number.isInteger(value) && value > 0 ? value : null;
}

function entity(name: string, id: number | null): StartLinkEntity | null {
  return name === '' && id === null ? null : { id, name };
}

export function parseStartLink(search: string): StartLinkFields {
  const query = new URLSearchParams(search);
  const rateText = query.get('rate')?.trim() ?? '';
  const rate = rateText === '' ? NaN : Number(rateText);
  return {
    place: entity(
      query.get('place')?.trim().slice(0, MAX_LOCATION_NAME).trim() ?? '',
      positiveInt(query.get('placeId'))
    ),
    payee: entity(
      query.get('payee')?.trim().slice(0, MAX_TAX_NAME).trim() ?? '',
      positiveInt(query.get('payeeId'))
    ),
    rate: rate >= 0 && rate <= 100 ? rate : null,
    notes: (query.get('notes') ?? '').trim().slice(0, MAX_SURVEY_NOTES),
  };
}

export function fromInfoFields({ location, tax, notes }: InfoFields): StartLinkFields {
  return {
    place: location,
    payee: tax === null ? null : { id: null, name: tax.name },
    rate: tax?.pct ?? null,
    notes,
  };
}

export function toInfoFields(
  fields: StartLinkFields,
  names: { place?: string; payee?: string } = {}
): InfoFields {
  const placeName = fields.place?.name.trim() || names.place || '';
  const payeeName = names.payee || fields.payee?.name.trim() || '';
  return {
    location: placeName === '' ? null : { id: fields.place?.id ?? null, name: placeName },
    tax: payeeName !== '' && fields.rate !== null ? { name: payeeName, pct: fields.rate } : null,
    notes: fields.notes,
  };
}
