import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CharacterContact } from '@/esi/endpoints';
import { contactTypeLabelKey } from './contactsFilter';
import { contactLabelNames } from './contacts';
import { achievementCsvColumns } from './achievementCsv';
import type { AchievementLookup } from './useCharacterAchievements';
import type { ContactAffiliationRow } from './contactAffiliation';
import type { AcrossCharactersRow } from './contactsAcrossCharacters';
import { exportFlag } from '@/lib/exportFlag';

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
 * CSV columns for the Character tab (issue #2164): name, type, corporation and
 * alliance, whether either is the pilot's own, title and score, standing,
 * labels, blocked, watched. A fixed set independent of the table's column
 * picker, splitting its combined `flags` cell into its own blocked/watched
 * columns. `labels` are the contact's in-game label names joined (the table's
 * optional Labels column, which only exists for a pilot who has labels). The
 * table's two-line Affiliation cell is two columns here, corporation and
 * alliance, each with an own-corporation / own-alliance flag. `standing` passes
 * through as the raw number, not the `StandingIcon` tag the table renders. The
 * title and score read the public records the Title / Score column loads, so
 * they are blank until that has been read.
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
      value: (contact) => contactLabelNames(contact, contactLabels).join(', '),
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

/**
 * CSV columns for the Across tab (issue #2164): name, type, how many characters
 * hold the contact, out of how many, who holds it and who does not, each
 * holder's own standing, and whether the characters disagree. `held` and
 * `total` are raw numbers. `standings` is a deliberate exception: one
 * `"Name: value"` pair per holding character, joined, so a row where two alts
 * disagree (`"Main: 10; Hauler: -10"`) says which one holds which. A deduped
 * list of values would lose exactly that. There is no fixed per-character
 * column set to spread them into either: the character list differs per pilot.
 */
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
      value: (row) => row.held.map((h) => h.name).join('; '),
    },
    {
      header: t('contacts.csvAcrossMissing'),
      value: (row) => row.missing.map((m) => m.name).join('; '),
    },
    {
      header: t('contacts.acrossStandings'),
      value: (row) => row.held.map((h) => `${h.name}: ${h.contact.standing}`).join('; '),
    },
    { header: t('contacts.csvAcrossDisagrees'), value: (row) => exportFlag(t, row.disagrees) },
  ];
}
