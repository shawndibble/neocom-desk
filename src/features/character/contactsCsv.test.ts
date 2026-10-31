import { describe, it, expect } from 'vitest';
import { contactsCsvColumns, contactsAcrossCsvColumns } from './contactsCsv';
import { toCsv } from '@/lib/csv';
import type { CharacterContact } from '@/esi/endpoints';
import type { ContactAffiliationRow } from './contactAffiliation';
import type { AcrossCharactersRow } from './contactsAcrossCharacters';

const t = (k: string) => k;
const NO_ACHIEVEMENTS = { partsOf: () => null, scoreOf: () => undefined };
const NO_LABELS = new Map<number, string>();
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
  it('orders columns name, type, affiliation, alliance, own flags, title/score, standing, labels, blocked, watched', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map(), NO_LABELS, NO_ACHIEVEMENTS);
    expect(columns.map((c) => c.header)).toEqual([
      'contacts.name',
      'contacts.type',
      'contacts.affiliation',
      'contacts.csvAlliance',
      'contacts.ownCorporation',
      'contacts.ownAlliance',
      'characters.csvAchievementTitle',
      'characters.csvAchievementScore',
      'contacts.standing',
      'contacts.labels',
      'contacts.blocked',
      'contacts.watched',
    ]);
  });

  it('prints the same Type word the table does, NPC agents included', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map(), NO_LABELS, NO_ACHIEVEMENTS);
    const type = columns.find((c) => c.header === 'contacts.type')!;
    expect(type.value(contact())).toBe('contacts.typeCharacter');
    expect(type.value(contact({ contact_id: 3008416 }))).toBe('contacts.typeNpcAgent');
  });

  it('falls back to the id, never a blank cell, for a name that did not resolve', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map(), NO_LABELS, NO_ACHIEVEMENTS);
    const values = Object.fromEntries(columns.map((c) => [c.header, c.value(contact())]));
    expect(values['contacts.name']).toBe('#1001');
  });

  it('emits standing as a raw number, not a formatted string', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map(), NO_LABELS, NO_ACHIEVEMENTS);
    const values = Object.fromEntries(
      columns.map((c) => [c.header, c.value(contact({ standing: -5.5 }))])
    );
    expect(values['contacts.standing']).toBe(-5.5);
  });

  it('translates blocked/watched flags rather than printing raw booleans', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map(), NO_LABELS, NO_ACHIEVEMENTS);
    const flagged = contact({ is_blocked: true, is_watched: true });
    const plain = contact({ contact_id: 1002 });
    const flaggedValues = Object.fromEntries(columns.map((c) => [c.header, c.value(flagged)]));
    const plainValues = Object.fromEntries(columns.map((c) => [c.header, c.value(plain)]));
    expect(flaggedValues['contacts.blocked']).toBe('common.exportFlagYes');
    expect(flaggedValues['contacts.watched']).toBe('common.exportFlagYes');
    expect(plainValues['contacts.blocked']).toBe('common.exportFlagNo');
    expect(plainValues['contacts.watched']).toBe('common.exportFlagNo');
  });

  it('prints the resolved corp name for affiliation, and null when there is none', () => {
    const names = new Map([[2001, 'Home Corp']]);
    const affiliationRows = new Map([[1001, affiliationRow({ corporationId: 2001 })]]);
    const columns = contactsCsvColumns(t, names, affiliationRows, NO_LABELS, NO_ACHIEVEMENTS);
    const withCorp = Object.fromEntries(columns.map((c) => [c.header, c.value(contact())]));
    expect(withCorp['contacts.affiliation']).toBe('Home Corp');

    const noAffiliation = contactsCsvColumns(t, names, new Map(), NO_LABELS, NO_ACHIEVEMENTS);
    const values = Object.fromEntries(noAffiliation.map((c) => [c.header, c.value(contact())]));
    expect(values['contacts.affiliation']).toBeNull();
  });

  it('carries alliance, own-corp/alliance flags, label names and title/score', () => {
    const names = new Map([
      [2001, 'Home Corp'],
      [3001, 'Home Alliance'],
    ]);
    const affiliationRows = new Map([
      [
        1001,
        affiliationRow({
          corporationId: 2001,
          allianceId: 3001,
          inOwnCorporation: true,
          inOwnAlliance: false,
        }),
      ],
    ]);
    const columns = contactsCsvColumns(
      t,
      names,
      affiliationRows,
      new Map([
        [7, 'Friends'],
        [8, 'Traders'],
      ]),
      { partsOf: () => ({ title: 'Veteran', score: 900 }), scoreOf: () => 900 }
    );
    const values = Object.fromEntries(
      columns.map((c) => [c.header, c.value(contact({ label_ids: [7, 8, 99] }))])
    );
    expect(values).toMatchObject({
      'contacts.csvAlliance': 'Home Alliance',
      'contacts.ownCorporation': 'common.exportFlagYes',
      'contacts.ownAlliance': 'common.exportFlagNo',
      'characters.csvAchievementTitle': 'Veteran',
      'characters.csvAchievementScore': 900,
      'contacts.labels': 'Friends, Traders',
    });
  });

  it('leaves own-corp/alliance blank unless a character has a loaded affiliation', () => {
    const rows = new Map([
      [1001, affiliationRow({ corporationId: 2001, inOwnCorporation: true })],
      [1002, affiliationRow()],
      [2001, affiliationRow({ corporationId: 2001 })],
    ]);
    const columns = contactsCsvColumns(t, new Map(), rows, NO_LABELS, NO_ACHIEVEMENTS);
    const own = (c: CharacterContact) =>
      columns.find((col) => col.header === 'contacts.ownCorporation')!.value(c);
    expect(own(contact())).toBe('common.exportFlagYes');
    expect(own(contact({ contact_id: 1002 }))).toBeNull();
    expect(own(contact({ contact_id: 2001, contact_type: 'corporation' }))).toBeNull();
    expect(own(contact({ contact_id: 5 }))).toBeNull();
  });

  it('round-trips through toCsv with exactly one BOM', () => {
    const columns = contactsCsvColumns(t, new Map(), new Map(), NO_LABELS, NO_ACHIEVEMENTS);
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

  it('orders columns name, type, held, total, holders, missing, standings, disagree', () => {
    const columns = contactsAcrossCsvColumns(t, new Map());
    expect(columns.map((c) => c.header)).toEqual([
      'contacts.name',
      'contacts.type',
      'contacts.acrossCharacters',
      'contacts.csvAcrossTotal',
      'contacts.csvAcrossHolders',
      'contacts.csvAcrossMissing',
      'contacts.acrossStandings',
      'contacts.csvAcrossDisagrees',
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

  it("names holders and missing characters, with each holder's own standing", () => {
    const columns = contactsAcrossCsvColumns(t, new Map());
    const values = Object.fromEntries(
      columns.map((c) => [
        c.header,
        c.value(
          row({
            held: [
              { characterId: 1, name: 'Main', contact: contact({ standing: 10 }) },
              { characterId: 2, name: 'Hauler', contact: contact({ standing: -10 }) },
            ],
            missing: [{ characterId: 3, name: 'Scout' }],
            standings: [-10, 10],
            disagrees: true,
          })
        ),
      ])
    );
    expect(values).toMatchObject({
      'contacts.acrossCharacters': 2,
      'contacts.csvAcrossTotal': 3,
      'contacts.csvAcrossHolders': 'Main; Hauler',
      'contacts.csvAcrossMissing': 'Scout',
      'contacts.acrossStandings': 'Main: 10; Hauler: -10',
      'contacts.csvAcrossDisagrees': 'common.exportFlagYes',
    });
  });

  it('round-trips through toCsv with exactly one BOM', () => {
    const columns = contactsAcrossCsvColumns(t, new Map());
    const csv = toCsv([row()], columns);
    expect(csv.split(BOM).length - 1).toBe(1);
  });
});
