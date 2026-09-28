import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CharacterContact } from '@/esi/endpoints';
import { CONTACT_TYPE_KEY } from './contactsFilter';
import type { ContactAffiliationRow } from './contactAffiliation';
import type { AcrossCharactersRow } from './contactsAcrossCharacters';

function entityName(names: ReadonlyMap<number, string>, id: number): string {
  return names.get(id) ?? `#${id}`;
}

function yesNo(t: CsvTranslate, value: boolean): string {
  return value ? t('contacts.csvYes') : t('contacts.csvNo');
}

/**
 * CSV columns for the Character tab (issue #2164): name, type, affiliation,
 * standing, blocked, watched. A fixed set independent of the table's column
 * picker, splitting its combined `flags` cell into its own blocked/watched
 * columns and dropping `labels` (in-game labels, not core to the export).
 * `standing` passes through as the raw number, not the `StandingIcon` tag the
 * table renders. Affiliation prints the corp name only, never the alliance
 * too: the table shows both on separate lines, but a CSV row is flat, and the
 * corp is the more specific of the two.
 */
export function contactsCsvColumns(
  t: CsvTranslate,
  names: ReadonlyMap<number, string>,
  affiliationRows: ReadonlyMap<number, ContactAffiliationRow>
): CsvColumn<CharacterContact>[] {
  return [
    { header: t('contacts.name'), value: (contact) => entityName(names, contact.contact_id) },
    { header: t('contacts.type'), value: (contact) => t(CONTACT_TYPE_KEY[contact.contact_type]) },
    {
      header: t('contacts.affiliation'),
      value: (contact) => {
        const row = affiliationRows.get(contact.contact_id);
        return row && row.corporationId !== null ? entityName(names, row.corporationId) : null;
      },
    },
    { header: t('contacts.standing'), value: (contact) => contact.standing },
    {
      header: t('contacts.blocked'),
      value: (contact) => yesNo(t, contact.is_blocked === true),
    },
    {
      header: t('contacts.watched'),
      value: (contact) => yesNo(t, contact.is_watched === true),
    },
  ];
}

/**
 * CSV columns for the Across tab (issue #2164): name, type, how many
 * characters hold the contact, and every distinct standing set on it.
 * `held` is a raw number, matching every other numeric export column; `standings`
 * is a deliberate exception (a joined string, e.g. `"10, -10"`) — a row here
 * can carry more than one standing, and reducing that to a single raw number
 * would drop exactly the disagreement this tab exists to show. There is no
 * fixed per-character column set to spread them into either: the character
 * list differs per pilot.
 */
export function contactsAcrossCsvColumns(
  t: CsvTranslate,
  names: ReadonlyMap<number, string>
): CsvColumn<AcrossCharactersRow>[] {
  return [
    { header: t('contacts.name'), value: (row) => entityName(names, row.contactId) },
    { header: t('contacts.type'), value: (row) => t(CONTACT_TYPE_KEY[row.contactType]) },
    { header: t('contacts.acrossCharacters'), value: (row) => row.held.length },
    { header: t('contacts.acrossStandings'), value: (row) => row.standings.join(', ') },
  ];
}
