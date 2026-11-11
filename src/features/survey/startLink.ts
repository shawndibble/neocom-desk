/**
 * A **Survey start link**: `/survey` plus a query that carries the Additional
 * information (location, moon tax payee and rate, notes) a pilot wants every
 * new Survey to begin with, so a link in a calendar, a chat or a site starts a
 * field already set up. The query is read by anyone who opens the link, so
 * `parseStartLink` trusts nothing in it: the same shapes and caps a stored
 * Survey has, else the part is dropped. Pure.
 *
 * A place or payee may be given by ID alone; the page names it with ESI's
 * public lookup (`startLinkNames.ts`). So a field here can hold an ID with no
 * name yet, and `toInfoFields` is what leaves only complete ones.
 */
import type { InfoFields } from '@/engine/survey/infoTemplate';
import type { SurveyPlaceKind } from './surveyPlaces';
import { MAX_LOCATION_NAME, MAX_SURVEY_NOTES, MAX_TAX_NAME } from './surveyStore';

export const START_LINK_PATH = '/survey';

/** An ID and/or a name; `name` is empty while only the ID is known. */
export interface StartLinkEntity {
  id: number | null;
  name: string;
  /**
   * What the picker said a place is, when it did. A system or NPC station ESI's
   * public lookup can name from its ID, so the link leaves its name out; a structure
   * (or a typed place) can't be, so its name stays.
   */
  kind?: SurveyPlaceKind;
}

/** What a start link, or the form that builds one, holds. */
export interface StartLinkFields {
  place: StartLinkEntity | null;
  payee: StartLinkEntity | null;
  /** The moon tax rate, 0 to 100; null when blank or invalid. */
  rate: number | null;
  notes: string;
}

export const EMPTY_START_LINK: StartLinkFields = {
  place: null,
  payee: null,
  rate: null,
  notes: '',
};

/** The router path of the start link for these fields, query included when any is set. */
export function startLinkPath({ place, payee, rate, notes }: StartLinkFields): string {
  const query = new URLSearchParams();
  // An ID the public lookup can name stands alone: a payee's, and a system's or NPC station's.
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

function positiveInt(text: string | null): number | null {
  const value = Number(text);
  return text !== null && text.trim() !== '' && Number.isInteger(value) && value > 0 ? value : null;
}

function entity(name: string, id: number | null): StartLinkEntity | null {
  return name === '' && id === null ? null : { id, name };
}

/** The fields a start link's query holds; anything missing or invalid is left blank. */
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

/** A Survey's Additional information as the fields that would build its start link. */
export function fromInfoFields({ location, tax, notes }: InfoFields): StartLinkFields {
  return {
    place: location,
    payee: tax === null ? null : { id: null, name: tax.name },
    rate: tax?.pct ?? null,
    notes,
  };
}

/**
 * The fields as a Survey stores them. `names` are the ones ESI gave for an ID;
 * a typed name wins for the place, a resolved one for the payee (it is the
 * in-game spelling). A place or payee still nameless, or a payee without a
 * rate, is left out.
 */
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
