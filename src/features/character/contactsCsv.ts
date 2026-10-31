import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CharacterContact } from '@/esi/endpoints';
import { contactTypeLabelKey } from './contactsFilter';
import { contactLabelNames } from './contacts';
import { achievementCsvColumns } from './achievementCsv';
import type { AchievementLookup } from './useCharacterAchievements';
import type { ContactAffiliationRow } from './contactAffiliation';
import type { AcrossCharactersRow } from './contactsAcrossCharacters';
import { exportFlag } from '@/lib/exportFlag';
import { joined } from '@/lib/exportSheets';

function entityName(names: ReadonlyMap<number, string>, id: number): string {
  return names.get(id) ?? `#${id}`;
}

/** Own-corporation and own-alliance are only known for a character whose affiliation has loaded. */
function ownable(
  contact: CharacterContact,
  affiliationRows: ReadonlyMap<number, ContactAffiliationRow>
): ContactAffiliationRow | undefined {
  if (contact.contact_type !== 'character') return undefined;
  const row = affiliationRows.get(contact.contact_id);
  return row && row.corporationId !== null ? row : undefined;
}

/**
 * CSV columns for the Character tab: a fixed set, whatever the column picker shows, splitting the
 * table's Affiliation and flags cells. Title and score are blank until the public records are read.
 */
export function contactsCsvColumns(
  t: CsvTranslate,
  names: ReadonlyMap<number, string>,
  affiliationRows: ReadonlyMap<number, ContactAffiliationRow>,
  contactLabels: ReadonlyMap<number, string>,
  achievements: AchievementLookup
): CsvColumn<CharacterContact>[] {
  return [
    { header: t('contacts.name'), value: (contact) => entityName(names, contact.contact_id) },
    { header: t('contacts.type'), value: (contact) => t(contactTypeLabelKey(contact)) },
    {
      header: t('contacts.affiliation'),
      value: (contact) => {
        const row = affiliationRows.get(contact.contact_id);
        return row && row.corporationId !== null ? entityName(names, row.corporationId) : null;
      },
    },
    {
      header: t('contacts.csvAlliance'),
      value: (contact) => {
        const row = affiliationRows.get(contact.contact_id);
        return row && row.allianceId !== null ? entityName(names, row.allianceId) : null;
      },
    },
    {
      header: t('contacts.ownCorporation'),
      value: (contact) => {
        const row = ownable(contact, affiliationRows);
        return exportFlag(t, row?.inOwnCorporation);
      },
    },
    {
      header: t('contacts.ownAlliance'),
      value: (contact) => {
        const row = ownable(contact, affiliationRows);
        return exportFlag(t, row?.inOwnAlliance);
      },
    },
    ...achievementCsvColumns<CharacterContact>(t, (contact) => contact.contact_id, achievements),
    { header: t('contacts.standing'), value: (contact) => contact.standing },
    {
      header: t('contacts.labels'),
      value: (contact) => joined(contactLabelNames(contact, contactLabels)),
    },
    {
      header: t('contacts.blocked'),
      value: (contact) => exportFlag(t, contact.is_blocked === true),
    },
    {
      header: t('contacts.watched'),
      value: (contact) => exportFlag(t, contact.is_watched === true),
    },
  ];
}

/** CSV columns for the Across tab. Standings are `"Name: value"` pairs, so a row where alts disagree says which holds which. */
export function contactsAcrossCsvColumns(
  t: CsvTranslate,
  names: ReadonlyMap<number, string>
): CsvColumn<AcrossCharactersRow>[] {
  return [
    { header: t('contacts.name'), value: (row) => entityName(names, row.contactId) },
    {
      header: t('contacts.type'),
      value: (row) =>
        t(contactTypeLabelKey({ contact_id: row.contactId, contact_type: row.contactType })),
    },
    { header: t('contacts.acrossCharacters'), value: (row) => row.held.length },
    { header: t('contacts.csvAcrossTotal'), value: (row) => row.held.length + row.missing.length },
    {
      header: t('contacts.csvAcrossHolders'),
      value: (row) => joined(row.held.map((h) => h.name)),
    },
    {
      header: t('contacts.csvAcrossMissing'),
      value: (row) => joined(row.missing.map((m) => m.name)),
    },
    {
      header: t('contacts.acrossStandings'),
      value: (row) => joined(row.held.map((h) => `${h.name}: ${h.contact.standing}`)),
    },
    { header: t('contacts.csvAcrossDisagrees'), value: (row) => exportFlag(t, row.disagrees) },
  ];
}
