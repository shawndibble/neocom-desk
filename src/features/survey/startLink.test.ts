import { describe, expect, it } from 'vitest';
import { MAX_LOCATION_NAME, MAX_SURVEY_NOTES, MAX_TAX_NAME } from './surveyStore';
import {
  EMPTY_START_LINK,
  fromInfoFields,
  parseStartLink,
  startLinkPath,
  toInfoFields,
} from './startLink';

const FULL = {
  place: { id: 30000142, name: 'Jita' },
  payee: { id: 98000001, name: 'Bob Corp' },
  rate: 12.5,
  notes: 'Fleet at 19:00 & bring a hauler',
};

const queryOf = (path: string) => path.split('?')[1] ?? '';

describe('startLinkPath', () => {
  it('is the bare /survey page when nothing is set', () => {
    expect(startLinkPath(EMPTY_START_LINK)).toBe('/survey');
  });

  it('round-trips every field, including characters a URL must escape', () => {
    // A payee with an ID travels as the ID alone: ESI names it.
    const expected = { ...FULL, payee: { id: 98000001, name: '' } };
    expect(parseStartLink(queryOf(startLinkPath(FULL)))).toEqual(expected);
  });

  it('leaves a name out when its id is one the public lookup can name', () => {
    const fields = {
      ...FULL,
      place: { id: 30000142, name: 'Jita', kind: 'system' as const },
    };
    expect(startLinkPath(fields)).toBe(
      '/survey?placeId=30000142&payeeId=98000001&rate=12.5&notes=Fleet+at+19%3A00+%26+bring+a+hauler'
    );
  });

  it('keeps a structure’s name beside its id, since only a login can name it', () => {
    const fields = {
      ...EMPTY_START_LINK,
      place: { id: 1020000000001, name: 'Efa - My Keepstar', kind: 'structure' as const },
    };
    expect(startLinkPath(fields)).toBe('/survey?place=Efa+-+My+Keepstar&placeId=1020000000001');
  });

  it('round-trips a typed place with no id, and an id with no name', () => {
    const fields = {
      ...EMPTY_START_LINK,
      place: { id: null, name: 'My POS in Efa' },
      payee: { id: 5, name: '' },
    };
    expect(parseStartLink(queryOf(startLinkPath(fields)))).toEqual(fields);
  });
});

describe('parseStartLink', () => {
  it('reads nothing from a bare or unrelated query', () => {
    expect(parseStartLink('')).toEqual(EMPTY_START_LINK);
    expect(parseStartLink('utm_source=calendar')).toEqual(EMPTY_START_LINK);
  });

  it('reads a rate only when it is a number from 0 to 100', () => {
    expect(parseStartLink('rate=101').rate).toBeNull();
    expect(parseStartLink('rate=-1').rate).toBeNull();
    expect(parseStartLink('rate=abc').rate).toBeNull();
    expect(parseStartLink('rate=').rate).toBeNull();
    expect(parseStartLink('rate=0').rate).toBe(0);
  });

  it('reads an id only when it is a positive integer', () => {
    expect(parseStartLink('place=Efa&placeId=-3').place).toEqual({ id: null, name: 'Efa' });
    expect(parseStartLink('place=Efa&placeId=1.5').place).toEqual({ id: null, name: 'Efa' });
    expect(parseStartLink('placeId=7').place).toEqual({ id: 7, name: '' });
    expect(parseStartLink('payeeId=abc').payee).toBeNull();
  });

  it('cuts each text to the length a survey stores, so the page never offers more than it can write', () => {
    const long = (n: number) => 'x'.repeat(n + 50);
    const parsed = parseStartLink(
      `place=${long(MAX_LOCATION_NAME)}&payee=${long(MAX_TAX_NAME)}&notes=${long(MAX_SURVEY_NOTES)}`
    );
    expect(parsed.place?.name).toHaveLength(MAX_LOCATION_NAME);
    expect(parsed.payee?.name).toHaveLength(MAX_TAX_NAME);
    expect(parsed.notes).toHaveLength(MAX_SURVEY_NOTES);
  });
});

describe('toInfoFields', () => {
  it('keeps a typed place name, and takes a resolved payee name over the typed one', () => {
    expect(toInfoFields(FULL, { place: 'Jita IV', payee: 'Bob Corporation' })).toEqual({
      location: { id: 30000142, name: 'Jita' },
      tax: { name: 'Bob Corporation', pct: 12.5 },
      notes: FULL.notes,
    });
  });

  it('names an id-only place from the lookup, and leaves out what stays nameless', () => {
    const fields = { ...EMPTY_START_LINK, place: { id: 7, name: '' }, payee: { id: 5, name: '' } };
    expect(toInfoFields(fields, { place: 'Efa' }).location).toEqual({ id: 7, name: 'Efa' });
    expect(toInfoFields(fields).location).toBeNull();
    expect(toInfoFields({ ...fields, rate: 10 }).tax).toBeNull();
  });

  it('leaves the tax out without a rate', () => {
    expect(toInfoFields({ ...FULL, rate: null }).tax).toBeNull();
  });
});

describe('fromInfoFields', () => {
  it('turns a survey’s information back into link fields', () => {
    expect(
      fromInfoFields({
        location: { id: 7, name: 'Efa' },
        tax: { name: 'Bob', pct: 10 },
        notes: 'n',
      })
    ).toEqual({
      place: { id: 7, name: 'Efa' },
      payee: { id: null, name: 'Bob' },
      rate: 10,
      notes: 'n',
    });
  });
});
