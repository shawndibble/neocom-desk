import { describe, it, expect } from 'vitest';
import { contactsCsvColumns, contactsAcrossCsvColumns } from './contactsCsv';
import { toCsv } from '@/lib/csv';
import type { CharacterContact } from '@/esi/endpoints';
import type { ContactAffiliationRow } from './contactAffiliation';
import type { AcrossCharactersRow } from './contactsAcrossCharacters';

const t = (k: string) => k;
const BOM = String.fromCharCode(0xfeff);

function contact(overrides: Partial<CharacterContact> = {}): CharacterContact {
  return {
    contact_id: 1001,
    contact_type: 'character',
    standing: 10,
    ...overrides,
  };
}

function affiliationRow(overrides: Partial<ContactAffiliationRow> = {}): ContactAffiliationRow {
  return {
    corporationId: null,
    allianceId: null,
    inOwnCorporation: false,
    inOwnAlliance: false,
    alsoVia: null,
    ...overrides,
  };
}

describe('contactsCsvColumns', () => {
  it('orders columns name, type, affiliation, standing, blocked, watched, using the i18n keys as headers', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map());
    expect(columns.map((c) => c.header)).toEqual([
      'contacts.name',
      'contacts.type',
      'contacts.affiliation',
      'contacts.standing',
      'contacts.blocked',
      'contacts.watched',
    ]);
  });

  it('falls back to the id, never a blank cell, for a name that did not resolve', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map());
    const values = Object.fromEntries(columns.map((c) => [c.header, c.value(contact())]));
    expect(values['contacts.name']).toBe('#1001');
  });

  it('emits standing as a raw number, not a formatted string', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map());
    const values = Object.fromEntries(
      columns.map((c) => [c.header, c.value(contact({ standing: -5.5 }))])
    );
    expect(values['contacts.standing']).toBe(-5.5);
  });

  it('translates blocked/watched flags rather than printing raw booleans', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map());
    const flagged = contact({ is_blocked: true, is_watched: true });
    const plain = contact({ contact_id: 1002 });
    const flaggedValues = Object.fromEntries(columns.map((c) => [c.header, c.value(flagged)]));
    const plainValues = Object.fromEntries(columns.map((c) => [c.header, c.value(plain)]));
    expect(flaggedValues['contacts.blocked']).toBe('contacts.csvYes');
    expect(flaggedValues['contacts.watched']).toBe('contacts.csvYes');
    expect(plainValues['contacts.blocked']).toBe('contacts.csvNo');
    expect(plainValues['contacts.watched']).toBe('contacts.csvNo');
  });

  it('prints the resolved corp name for affiliation, and null when there is none', () => {
    const names = new Map([[2001, 'Home Corp']]);
    const affiliationRows = new Map([[1001, affiliationRow({ corporationId: 2001 })]]);
    const columns = contactsCsvColumns(t, names, affiliationRows);
    const withCorp = Object.fromEntries(columns.map((c) => [c.header, c.value(contact())]));
    expect(withCorp['contacts.affiliation']).toBe('Home Corp');

    const noAffiliation = contactsCsvColumns(t, names, new Map());
    const values = Object.fromEntries(noAffiliation.map((c) => [c.header, c.value(contact())]));
    expect(values['contacts.affiliation']).toBeNull();
  });

  it('round-trips through toCsv with exactly one BOM', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map());
    const csv = toCsv([contact()], columns);
    expect(csv.split(BOM).length - 1).toBe(1);
  });
});

describe('contactsAcrossCsvColumns', () => {
  function row(overrides: Partial<AcrossCharactersRow> = {}): AcrossCharactersRow {
    return {
      contactId: 1001,
      contactType: 'character',
      held: [],
      missing: [],
      standings: [],
      disagrees: false,
      ...overrides,
    };
  }

  it('orders columns name, type, held, standings, using the i18n keys as headers', () => {
    const columns = contactsAcrossCsvColumns(t, new Map());
    expect(columns.map((c) => c.header)).toEqual([
      'contacts.name',
      'contacts.type',
      'contacts.acrossCharacters',
      'contacts.acrossStandings',
    ]);
  });

  it('falls back to the id for an unresolved name, and counts holders', () => {
    const columns = contactsAcrossCsvColumns(t, new Map());
    const values = Object.fromEntries(
      columns.map((c) => [
        c.header,
        c.value(row({ held: [{ characterId: 91, name: 'Pilot One', contact: contact() }] })),
      ])
    );
    expect(values['contacts.name']).toBe('#1001');
    expect(values['contacts.acrossCharacters']).toBe(1);
  });

  it('joins every distinct standing into one cell', () => {
    const columns = contactsAcrossCsvColumns(t, new Map());
    const values = Object.fromEntries(
      columns.map((c) => [c.header, c.value(row({ standings: [-10, 10] }))])
    );
    expect(values['contacts.acrossStandings']).toBe('-10, 10');
  });

  it('round-trips through toCsv with exactly one BOM', () => {
    const columns = contactsAcrossCsvColumns(t, new Map());
    const csv = toCsv([row()], columns);
    expect(csv.split(BOM).length - 1).toBe(1);
  });
});
