import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  EmptyState,
  FilterBar,
  FilterChip,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Spinner,
  StandingIcon,
  Tabs,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { ICON_SIZE } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { useColumnVisibility } from '@/lib/columnVisibility';
import {
  CONTACTS_ACROSS_COLUMN_IDS,
  CONTACTS_CHARACTER_COLUMN_IDS,
  contactsAcrossColumnsStore,
  contactsCharacterColumnsStore,
  type ContactsAcrossColumnId,
  type ContactsCharacterColumnId,
} from './contactsColumns';
import { GrantBanner } from '@/app/GrantNote';
import { loadContacts } from '@/features/character/contacts';
import {
  ALL_CONTACT_TYPES,
  STANDING_CATEGORIES,
  EMPTY_CONTACTS_FILTER,
  activeContactsFilterCount,
  contactCountsByStanding,
  contactCountsByType,
  filterContacts,
  type ContactType,
  type ContactsFilter,
  type StandingCategory,
} from '@/features/character/contactsFilter';
import { ContactContextMenu } from '@/features/character/ContactContextMenu';
import {
  loadContactsAcrossCharacters,
  mergeContactsAcrossCharacters,
  type AcrossCharactersRow,
  type CharacterContactList,
} from '@/features/character/contactsAcrossCharacters';
import type { CachedResult } from '@/esi/cache';
import type { CharacterAffiliation, CharacterContact } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { resolveAffiliations } from '@/features/character/affiliations';
import {
  buildContactStandingIndex,
  type EffectiveStanding,
} from '@/features/character/contactStandings';
import {
  contactAffiliationRow,
  type ContactAffiliationRow,
  type OwnAffiliation,
} from '@/features/character/contactAffiliation';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { usePageTab } from '@/lib/usePageTab';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { boolParam, enumSetParam, textParam } from '@/lib/urlState';
import { CONTACTS_TABS } from '@/app/pageTabs';

interface Snapshot {
  contactsResult: CachedResult<CharacterContact[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  contactsNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  contactsTruncated: boolean;
  contactNames: Map<number, string>;
  /** Player contacts only, plus the signed-in character — see `loadContactsSnapshot`. */
  affiliations: Map<number, CharacterAffiliation>;
  /** The signed-in character's own corp and alliance, for the "yours" badges. */
  ownAffiliation: OwnAffiliation;
  /**
   * Every Character's contacts as last cached on this device, for the second
   * tab. Cache-only — a Dexie read, no network — so the ordinary visit pays
   * nothing for it; the tab offers a live fetch of its own.
   */
  acrossLists: CharacterContactList[];
}

/**
 * ESI's `contact_type` verbatim was what this column printed. "Player" is what
 * a pilot calls a character contact (a "character" is also a thing corps and
 * alliances are made of), and "Corp" is how the name is written everywhere in
 * game — both shorter than what they replace.
 */
const CONTACT_TYPE_KEY: Record<CharacterContact['contact_type'], string> = {
  character: 'contacts.typeCharacter',
  corporation: 'contacts.typeCorporation',
  alliance: 'contacts.typeAlliance',
  faction: 'contacts.typeFaction',
};

/** What the table prints for an id whose name has not resolved — searchable, per `contactsFilter`. */
function entityName(names: ReadonlyMap<number, string>, id: number): string {
  return names.get(id) ?? `#${id}`;
}

/** Stable identities, so a fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_AFFILIATIONS: ReadonlyMap<number, CharacterAffiliation> = new Map();
const NO_OWN_AFFILIATION: OwnAffiliation = {};
const NO_LISTS: readonly CharacterContactList[] = [];

async function loadContactsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const { cached: contactsResult, needsReauth: contactsNeedsReauth } =
    await loadContacts(characterId);
  const contactsTruncated = contactsResult?.truncated ?? false;
  // Already superseded: skip the lookups, their results would be discarded.
  const contacts = signal.cancelled ? [] : (contactsResult?.data ?? []);

  // The character's own affiliation rides along in the same request as their
  // contacts', so "is this pilot in my corp" costs no extra round trip.
  const playerIds = contacts.filter((c) => c.contact_type === 'character').map((c) => c.contact_id);
  const affiliations = await resolveAffiliations(
    playerIds.length === 0 ? [] : [...playerIds, characterId]
  );
  const ownAffiliation: OwnAffiliation = {
    corporationId: affiliations.get(characterId)?.corporation_id,
    allianceId: affiliations.get(characterId)?.alliance_id,
  };

  // Names come second because the corps and alliances to name are only known
  // once the affiliations are back. `resolveNames` is cache-first, so on every
  // visit after the first this costs no request at all.
  const affiliationIds = [...affiliations.values()].flatMap((a) =>
    a.alliance_id === undefined ? [a.corporation_id] : [a.corporation_id, a.alliance_id]
  );
  // The second tab lists contacts this character may not hold at all, so its
  // ids go into the same batch — otherwise every row belonging only to an alt
  // would print as `#id`.
  const acrossLists = await loadContactsAcrossCharacters();
  const contactNames = await resolveNames([
    ...contacts.map((c) => c.contact_id),
    ...affiliationIds,
    ...acrossLists.flatMap((list) => list.contacts.map((c) => c.contact_id)),
  ]);
  return {
    contactsResult,
    contactsNeedsReauth,
    contactsTruncated,
    contactNames,
    affiliations,
    ownAffiliation,
    acrossLists,
  };
}

/**
 * One contact flag as an icon. `role="img"` plus a tooltip rather than a
 * focusable trigger, the same trade `NotificationsPanel`'s badges make: the
 * meaning must reach a screen reader, but a tab stop on every row of a long
 * contact list is worse to keyboard through than the flag is worth.
 */
function FlagBadge({ icon, label, tone }: { icon: ReactElement; label: string; tone: string }) {
  return (
    <Tooltip content={label} openOnTap>
      <span role="img" aria-label={label} className={`shrink-0 ${tone}`}>
        {icon}
      </span>
    </Tooltip>
  );
}

interface ContactCounts {
  standing: Record<StandingCategory, number>;
  type: Record<ContactType, number>;
}

const STANDING_FILTER_KEY: Record<StandingCategory, string> = {
  good: 'contacts.filterGood',
  neutral: 'contacts.filterNeutral',
  bad: 'contacts.filterBad',
};

/** Toggling one member of a set-valued criterion, which is how both chip groups edit. */
function toggled<T>(set: ReadonlySet<T>, member: T): Set<T> {
  const next = new Set(set);
  if (next.has(member)) next.delete(member);
  else next.add(member);
  return next;
}

/**
 * `ContactsFilter` plus the Across tab's own criterion, so the sheet's draft
 * (issue #1282) can hold "Only disagreements" the same way it holds every
 * other chip — committed on Apply below `md`, immediately in the pointer-width
 * box. Local to this bar: `ContactsFilter` itself stays the Character tab's
 * type, with no across-only field grafted on for one consumer.
 */
type ContactsBarValue = ContactsFilter & { disagreementsOnly: boolean };

interface ContactsFilterBarProps {
  filter: ContactsFilter;
  onChange: (filter: ContactsFilter) => void;
  counts: ContactCounts;
  view: 'character' | 'across';
  disagreementsOnly: boolean;
  onDisagreementsOnlyChange: (value: boolean) => void;
  disagreementCount: number;
  /** The active tab's column picker, drawn beside the filter trigger. */
  actions?: ReactNode;
}

/**
 * Search plus a chip per contact type and per standing category. Both groups
 * show every member with its count, zeros included — so "you have no alliance
 * contacts" is on screen rather than inferred from a missing chip. Shared by
 * both tabs (issue #1282's picker is per-tab, in `actions`); the Across tab
 * adds its own "disagreements only" chip, since that criterion means nothing
 * on the Character tab.
 */
function ContactsFilterBar({
  filter,
  onChange,
  counts,
  view,
  disagreementsOnly,
  onDisagreementsOnlyChange,
  disagreementCount,
  actions,
}: ContactsFilterBarProps) {
  const { t } = useTranslation();
  const activeCount =
    activeContactsFilterCount(filter) + (view === 'across' && disagreementsOnly ? 1 : 0);
  const value: ContactsBarValue = { ...filter, disagreementsOnly };
  const handleChange = (next: ContactsBarValue) => {
    const { disagreementsOnly: nextDisagreementsOnly, ...nextFilter } = next;
    onChange(nextFilter);
    if (nextDisagreementsOnly !== disagreementsOnly)
      onDisagreementsOnlyChange(nextDisagreementsOnly);
  };
  return (
    <FilterBar
      value={value}
      onChange={handleChange}
      activeCount={activeCount}
      actions={actions}
      search={
        <SearchInput
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder={t('contacts.searchPlaceholder')}
          aria-label={t('contacts.searchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <div
            role="group"
            aria-label={t('contacts.typeFilterLabel')}
            className="flex flex-wrap gap-2"
          >
            {ALL_CONTACT_TYPES.map((type) => (
              <FilterChip
                key={type}
                label={t(CONTACT_TYPE_KEY[type])}
                selected={draft.types.has(type)}
                onToggle={() => setDraft({ ...draft, types: toggled(draft.types, type) })}
                count={counts.type[type]}
              />
            ))}
          </div>
          <div
            role="group"
            aria-label={t('contacts.standingFilterLabel')}
            className="flex flex-wrap gap-2"
          >
            {STANDING_CATEGORIES.map((category) => (
              <FilterChip
                key={category}
                label={t(STANDING_FILTER_KEY[category])}
                selected={draft.standings.has(category)}
                onToggle={() =>
                  setDraft({ ...draft, standings: toggled(draft.standings, category) })
                }
                count={counts.standing[category]}
              />
            ))}
          </div>
          {view === 'across' && (
            <FilterChip
              label={t('contacts.acrossDisagreementsOnly')}
              selected={draft.disagreementsOnly}
              onToggle={() => setDraft({ ...draft, disagreementsOnly: !draft.disagreementsOnly })}
              count={disagreementCount}
            />
          )}
        </>
      )}
    </FilterBar>
  );
}

/**
 * One line of the Corp / Alliance cell: the entity's name, a "yours" badge
 * when the contact sits inside the reader's own corp or alliance, and the
 * standing tag of a *separate* entry of theirs that also covers this pilot.
 *
 * The tag is placed against the entity it comes from rather than in the
 * Standing column, because the whole of its meaning is which entity supplied
 * it — in the Standing column it would read as a second opinion about the
 * pilot, which is exactly what it is not.
 */
function AffiliationLine({
  name,
  own,
  ownLabel,
  alsoVia,
  dim = false,
}: {
  name: string;
  own: boolean;
  ownLabel: string;
  alsoVia: EffectiveStanding | null;
  dim?: boolean;
}) {
  return (
    <span className={cx('flex items-center gap-1.5', dim && 'text-text-dim')}>
      {alsoVia && <StandingIcon value={alsoVia.standing} />}
      <span className="truncate">{name}</span>
      {own && (
        <Tooltip content={ownLabel} openOnTap>
          <span role="img" aria-label={ownLabel} className="shrink-0 text-accent">
            <Icon.Corporation size={ICON_SIZE.sm} />
          </span>
        </Tooltip>
      )}
    </span>
  );
}

/**
 * The filter bar, in the URL (ADR 0015) as one group — including the Across
 * tab's own "disagreements only" (issue #1282): two separate `useUrlParams`
 * groups writing in the same tick would each start from the URL as last
 * rendered and the second would drop the first (see `useUrlState.ts`'s own
 * doc comment), so every key `ContactsFilterBar` can change belongs here.
 */
const FILTER_PARAMS = {
  q: textParam(),
  types: enumSetParam(ALL_CONTACT_TYPES),
  standing: enumSetParam(STANDING_CATEGORIES),
  'across.disagree': boolParam(),
};
const CHARACTER_SORT = { columnId: 'standing', direction: 'desc' } as const;
const ACROSS_SORT = { columnId: 'held', direction: 'asc' } as const;

interface AcrossCharactersPanelProps {
  lists: readonly CharacterContactList[];
  names: ReadonlyMap<number, string>;
  filter: ContactsFilter;
  /** Lifted to `Contacts` (issue #1282): its chip now lives in the shared `FilterBar`. */
  disagreementsOnly: boolean;
  /** Reports the count up on every change, so the lifted chip can badge it — the `ContractSearchPanel`/`onStatusChange` pattern. */
  onDisagreementCountChange: (count: number) => void;
  isColumnVisible: (id: ContactsAcrossColumnId) => boolean;
}

/**
 * The same contacts, every Character at once: who holds each one, who does
 * not, and where they set it differently.
 *
 * Reads what each Character last cached rather than fetching them all on
 * arrival — a pilot with a dozen alts would otherwise pay a dozen paginated
 * fetches for opening a tab. The button fetches them on demand, and the hint
 * below the table says which of the two is on screen.
 */
function AcrossCharactersPanel({
  lists,
  names,
  filter,
  disagreementsOnly,
  onDisagreementCountChange,
  isColumnVisible,
}: AcrossCharactersPanelProps) {
  const { t } = useTranslation();
  const [fetched, setFetched] = useState<readonly CharacterContactList[] | null>(null);
  const [fetching, setFetching] = useState(false);

  const effectiveLists = fetched ?? lists;
  const rows = useMemo(() => mergeContactsAcrossCharacters(effectiveLists), [effectiveLists]);
  const disagreementCount = useMemo(() => rows.filter((row) => row.disagrees).length, [rows]);
  useEffect(
    () => onDisagreementCountChange(disagreementCount),
    [disagreementCount, onDisagreementCountChange]
  );

  const text = filter.text.trim().toLowerCase();
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (disagreementsOnly && !row.disagrees) return false;
        if (!filter.types.has(row.contactType)) return false;
        if (text === '') return true;
        return entityName(names, row.contactId).toLowerCase().includes(text);
      }),
    [rows, disagreementsOnly, filter.types, text, names]
  );

  async function fetchEveryCharacter() {
    setFetching(true);
    try {
      setFetched(await loadContactsAcrossCharacters({ live: true }));
    } finally {
      setFetching(false);
    }
  }

  // The identity column (never hidden) plus the optional columns the picker
  // controls, in table order — `CONTACTS_ACROSS_COLUMN_IDS`' own order.
  const optionalColumns: Record<ContactsAcrossColumnId, DataTableColumn<AcrossCharactersRow>> = {
    type: {
      id: 'type',
      header: t('contacts.type'),
      className: 'text-text-dim',
      render: (row) => t(CONTACT_TYPE_KEY[row.contactType]),
      sortValue: (row) => t(CONTACT_TYPE_KEY[row.contactType]),
    },
    held: {
      id: 'held',
      header: t('contacts.acrossCharacters'),
      headerTooltip: t('contacts.acrossCharactersHeaderTooltip'),
      align: 'center',
      // The names go in the tooltip rather than the cell: with a dozen alts
      // the cell would be the widest thing on the page, and the count is what
      // a reader scans for. The count takes focus so a keyboard can open it.
      render: (row) => (
        <Tooltip
          content={[
            t('contacts.acrossHeldBy', { names: row.held.map((h) => h.name).join(', ') }),
            row.missing.length > 0 &&
              t('contacts.acrossMissingOn', {
                names: row.missing.map((m) => m.name).join(', '),
              }),
          ]
            .filter(Boolean)
            .join(' · ')}
          openOnTap
        >
          <span
            tabIndex={0}
            className={cx(
              'tabular-nums focus-visible:outline-2 focus-visible:outline-accent',
              row.missing.length > 0 && 'text-warning'
            )}
          >
            {t('contacts.acrossCharactersCount', {
              count: row.held.length,
              total: effectiveLists.length,
            })}
          </span>
        </Tooltip>
      ),
      sortValue: (row) => row.held.length,
    },
    standings: {
      id: 'standings',
      header: t('contacts.acrossStandings'),
      align: 'center',
      // Every distinct standing, not an average: two alts at +10 and -10 have
      // no meaningful midpoint, and seeing both is the whole point of the row.
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {row.standings.map((standing) => (
            <StandingIcon key={standing} value={standing} />
          ))}
        </span>
      ),
      // Worst first on a descending click, which is the direction trouble is in.
      sortValue: (row) => row.standings[0],
    },
  };
  const columns: DataTableColumn<AcrossCharactersRow>[] = [
    {
      id: 'name',
      header: t('contacts.name'),
      render: (row) => entityName(names, row.contactId),
      sortValue: (row) => entityName(names, row.contactId),
    },
    ...CONTACTS_ACROSS_COLUMN_IDS.filter(isColumnVisible).map((id) => optionalColumns[id]),
  ];
  // The full catalog, not just `columns`' currently-visible ids: a sort
  // picked while a column was shown should still resolve once the picker
  // hides it, ready to take effect again the moment it's shown back
  // (`resolveSort` only rejects a `columnId` the catalog has never heard of).
  const sortProps = useUrlSort('across.sort', ACROSS_SORT, ['name', ...CONTACTS_ACROSS_COLUMN_IDS]);

  if (rows.length === 0) {
    return (
      <EmptyState title={t('contacts.acrossEmptyTitle')} hint={t('contacts.acrossEmptyHint')} />
    );
  }

  return (
    <Panel padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void fetchEveryCharacter()}
          disabled={fetching}
        >
          {t('contacts.acrossFetchAll')}
        </Button>
      </div>
      {fetched === null && (
        <p className="px-3 pt-2 text-[0.6875rem] text-text-dim">{t('contacts.acrossCachedHint')}</p>
      )}
      {visibleRows.length === 0 ? (
        <EmptyState
          title={t('contacts.acrossNoResults')}
          hint={t('contacts.acrossNoResultsHint')}
          className="py-8"
        />
      ) : (
        <DataTable
          label={t('contacts.acrossLabel')}
          columns={columns}
          rows={visibleRows}
          rowKey={(row) => `${row.contactType}:${row.contactId}`}
          {...sortProps}
          rowContextMenu={(row, tr) => (
            <ContactContextMenu
              contact={{ contact_id: row.contactId, contact_type: row.contactType }}
              name={entityName(names, row.contactId)}
            >
              {tr}
            </ContactContextMenu>
          )}
        />
      )}
    </Panel>
  );
}

/** Contacts: standings, blocked/watched state, searchable and filterable by type and standing. */
export function Contacts() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadContactsSnapshot,
    undefined,
    { cacheKey: 'contacts' }
  );

  const [filterParams, setFilterParams] = useUrlParams(FILTER_PARAMS);
  const filter = useMemo<ContactsFilter>(
    () => ({ text: filterParams.q, types: filterParams.types, standings: filterParams.standing }),
    [filterParams]
  );
  const setFilter = (next: ContactsFilter) =>
    setFilterParams({ q: next.text, types: next.types, standing: next.standings });
  const [tab, setTab] = usePageTab(CONTACTS_TABS);

  // Lifted out of `AcrossCharactersPanel` (issue #1282): its chip now lives in
  // the shared `ContactsFilterBar`, which neither tab's panel owns.
  const disagreementsOnly = filterParams['across.disagree'];
  const setDisagreementsOnly = (next: boolean) => setFilterParams({ 'across.disagree': next });
  const [disagreementCount, setDisagreementCount] = useState(0);

  const characterColumnVisibility = useColumnVisibility(
    contactsCharacterColumnsStore,
    CONTACTS_CHARACTER_COLUMN_IDS
  );
  const acrossColumnVisibility = useColumnVisibility(
    contactsAcrossColumnsStore,
    CONTACTS_ACROSS_COLUMN_IDS
  );

  const contactsResult = data?.contactsResult ?? null;
  const contactsNeedsReauth = data?.contactsNeedsReauth ?? false;
  const contactsTruncated = data?.contactsTruncated ?? false;
  const contactNames = data?.contactNames ?? NO_NAMES;
  const affiliations = data?.affiliations ?? NO_AFFILIATIONS;
  const acrossLists = data?.acrossLists ?? NO_LISTS;
  const ownAffiliation = data?.ownAffiliation ?? NO_OWN_AFFILIATION;

  const contacts = useMemo(() => contactsResult?.data ?? [], [contactsResult]);

  const counts = useMemo(
    () => ({
      standing: contactCountsByStanding(contacts),
      type: contactCountsByType(contacts),
    }),
    [contacts]
  );

  // Refreshing bumps useRouteSnapshot's epoch, which clears `data` (and so
  // `contactsResult`/`counts`) until the new load lands — remember
  // the last successful counts so the filter chips (and the user's active
  // selection) stay on screen through a refresh instead of disappearing.
  // Switching character bumps the same epoch, so the remembered counts must
  // be dropped there too — otherwise the outgoing character's chips would
  // linger under the incoming one until its own load lands.
  const [lastGoodCounts, setLastGoodCounts] = useState<ContactCounts | null>(null);
  const [lastGoodCharacterId, setLastGoodCharacterId] = useState(activeCharacterId);
  if (activeCharacterId !== lastGoodCharacterId) {
    setLastGoodCharacterId(activeCharacterId);
    setLastGoodCounts(null);
  } else if (contactsResult && !contactsNeedsReauth && lastGoodCounts !== counts) {
    setLastGoodCounts(counts);
  }

  const filteredContacts = useMemo(
    () => filterContacts(contacts, filter, contactNames),
    [contacts, filter, contactNames]
  );

  // Once per load rather than per render of a cell: `alsoVia` is a lookup
  // against an index built from the whole list, and the table re-renders on
  // every sort click and keystroke in the search box.
  const affiliationRows = useMemo(() => {
    const index = buildContactStandingIndex(contacts);
    return new Map<number, ContactAffiliationRow>(
      contacts.map((contact) => [
        contact.contact_id,
        contactAffiliationRow(contact, affiliations, ownAffiliation, index),
      ])
    );
  }, [contacts, affiliations, ownAffiliation]);

  function contactRowContextMenu(contact: CharacterContact, tr: ReactElement) {
    return (
      <ContactContextMenu
        contact={contact}
        name={contactNames.get(contact.contact_id) ?? `#${contact.contact_id}`}
      >
        {tr}
      </ContactContextMenu>
    );
  }

  // The identity column (never hidden) plus the optional columns the picker
  // controls, in table order — `CONTACTS_CHARACTER_COLUMN_IDS`' own order.
  const optionalCharacterColumns = useMemo<
    Record<ContactsCharacterColumnId, DataTableColumn<CharacterContact>>
  >(
    () => ({
      type: {
        id: 'type',
        header: t('contacts.type'),
        className: 'text-text-dim',
        render: (contact) => t(CONTACT_TYPE_KEY[contact.contact_type]),
        // Sorts on what is printed, not on ESI's word for it — otherwise
        // "Player" would sort under C and "Corp" under C too, by accident.
        sortValue: (contact) => t(CONTACT_TYPE_KEY[contact.contact_type]),
      },
      affiliation: {
        id: 'affiliation',
        header: t('contacts.affiliation'),
        headerTooltip: t('contacts.affiliationHeaderTooltip'),
        render: (contact) => {
          const row = affiliationRows.get(contact.contact_id);
          if (!row || row.corporationId === null) return '—';
          const alsoVia = row.alsoVia;
          return (
            <span className="flex min-w-0 flex-col">
              <AffiliationLine
                name={entityName(contactNames, row.corporationId)}
                own={row.inOwnCorporation}
                ownLabel={t('contacts.ownCorporation')}
                alsoVia={alsoVia?.source === 'corporation' ? alsoVia : null}
              />
              {row.allianceId !== null && (
                <AffiliationLine
                  name={entityName(contactNames, row.allianceId)}
                  own={row.inOwnAlliance}
                  ownLabel={t('contacts.ownAlliance')}
                  alsoVia={alsoVia?.source === 'alliance' ? alsoVia : null}
                  dim
                />
              )}
            </span>
          );
        },
        // Corp first, alliance second: a reader sorting this column is
        // gathering a corp's pilots together, not an alliance's.
        sortValue: (contact) => {
          const row = affiliationRows.get(contact.contact_id);
          return row?.corporationId === null || row === undefined
            ? undefined
            : entityName(contactNames, row.corporationId);
        },
      },
      standing: {
        id: 'standing',
        header: t('contacts.standing'),
        align: 'center',
        // The tag replaces the bar *and* the number: the value is in its
        // accessible name and its tooltip, and the column sorts on the raw
        // number below, so nothing is lost by not printing it.
        render: (contact) => <StandingIcon value={contact.standing} />,
        sortValue: (contact) => contact.standing,
      },
      flags: {
        id: 'flags',
        header: t('contacts.flags'),
        align: 'center',
        render: (contact) => {
          const blocked = contact.is_blocked === true;
          const watched = contact.is_watched === true;
          if (!blocked && !watched) return '—';
          return (
            <span className="inline-flex items-center gap-1.5">
              {blocked && (
                <FlagBadge
                  icon={<Icon.Blocked size={ICON_SIZE.sm} />}
                  label={t('contacts.blocked')}
                  tone="text-danger"
                />
              )}
              {watched && (
                <FlagBadge
                  icon={<Icon.Watched size={ICON_SIZE.sm} />}
                  label={t('contacts.watched')}
                  tone="text-warning"
                />
              )}
            </span>
          );
        },
        // Icon-only, but blocked/watched is a real two-level rank (issue
        // #1282) — blocked outranks watched, and a plain contact has neither
        // so it sinks (`undefined`) rather than sorting as "0".
        sortValue: (contact) => {
          const blocked = contact.is_blocked === true;
          const watched = contact.is_watched === true;
          if (!blocked && !watched) return undefined;
          return (blocked ? 2 : 0) + (watched ? 1 : 0);
        },
      },
    }),
    [t, contactNames, affiliationRows]
  );
  const columns = useMemo<DataTableColumn<CharacterContact>[]>(
    () => [
      {
        id: 'name',
        header: t('contacts.name'),
        render: (contact) => contactNames.get(contact.contact_id) ?? `#${contact.contact_id}`,
        sortValue: (contact) => contactNames.get(contact.contact_id) ?? `#${contact.contact_id}`,
      },
      ...CONTACTS_CHARACTER_COLUMN_IDS.filter(characterColumnVisibility.isVisible).map(
        (id) => optionalCharacterColumns[id]
      ),
    ],
    [t, contactNames, optionalCharacterColumns, characterColumnVisibility.isVisible]
  );
  // The full catalog, not just `columns`' currently-visible ids — see the
  // Across table's own `sortProps` for why.
  const characterSortProps = useUrlSort('sort', CHARACTER_SORT, [
    'name',
    ...CONTACTS_CHARACTER_COLUMN_IDS,
  ]);

  // `/contacts/across` with a single Character falls back to this Character's
  // view — but only once the snapshot says so: before it loads the list is
  // empty for everyone, and a reload of the across tab must not bounce.
  const view =
    tab === 'across' && (data === undefined || acrossLists.length > 1) ? 'across' : 'character';

  // Labels only, for the picker's menu — the real columns (with their
  // `render`) are built inside `AcrossCharactersPanel`, which alone has the
  // fetch state (`effectiveLists.length`) one of them needs. `ColumnPickerMenu`
  // never calls `render`, so the stub here can't drift into what's on screen.
  const acrossColumnsById: Record<ContactsAcrossColumnId, DataTableColumn<AcrossCharactersRow>> = {
    type: { id: 'type', header: t('contacts.type'), render: () => null },
    held: { id: 'held', header: t('contacts.acrossCharacters'), render: () => null },
    standings: { id: 'standings', header: t('contacts.acrossStandings'), render: () => null },
  };

  // One `ColumnPickerMenu` in the shared `FilterBar`, controlling whichever
  // tab's table is showing (issue #1282) — each tab keeps its own visibility
  // setting, so switching tabs never carries one's hidden columns onto the other's.
  const columnPickerActions =
    view === 'across' ? (
      <ColumnPickerMenu
        available={CONTACTS_ACROSS_COLUMN_IDS}
        visible={acrossColumnVisibility.visible}
        columnsById={acrossColumnsById}
        onToggle={acrossColumnVisibility.toggle}
        buttonLabel={t('common.columnsButton')}
        menuTitle={t('common.columnsMenuTitle')}
        onReset={acrossColumnVisibility.reset}
        resetLabel={t('common.resetColumns')}
      />
    ) : (
      <ColumnPickerMenu
        available={CONTACTS_CHARACTER_COLUMN_IDS}
        visible={characterColumnVisibility.visible}
        columnsById={optionalCharacterColumns}
        onToggle={characterColumnVisibility.toggle}
        buttonLabel={t('common.columnsButton')}
        menuTitle={t('common.columnsMenuTitle')}
        onReset={characterColumnVisibility.reset}
        resetLabel={t('common.resetColumns')}
      />
    );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('contacts.title')}
        meta={contactsResult && <DataAgeBadge date={contactsResult.fetchedAt} />}
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label={t('contacts.refresh')}
            onClick={refresh}
            disabled={loading}
          />
        }
      />

      {/* One character is the whole roster: there is nothing to compare it
          against, so the second tab would only ever restate this one. */}
      {acrossLists.length > 1 && (
        <Tabs
          label={t('contacts.title')}
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
          tabs={CONTACTS_TABS.tabs.map((item) => ({ id: item.id, label: t(item.labelKey) }))}
        />
      )}

      {/* Shared with the second tab: a name typed into the box, or a type
          switched off, means the same thing on either. The standing chips do
          not — a row there carries several standings — so that tab ignores
          them and says so with a chip of its own. */}
      {lastGoodCounts && (
        <ContactsFilterBar
          filter={filter}
          onChange={setFilter}
          counts={lastGoodCounts}
          view={view}
          disagreementsOnly={disagreementsOnly}
          onDisagreementsOnlyChange={setDisagreementsOnly}
          disagreementCount={disagreementCount}
          actions={columnPickerActions}
        />
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : view === 'across' ? (
        <AcrossCharactersPanel
          lists={acrossLists}
          names={contactNames}
          filter={filter}
          disagreementsOnly={disagreementsOnly}
          onDisagreementCountChange={setDisagreementCount}
          isColumnVisible={acrossColumnVisibility.isVisible}
        />
      ) : contactsNeedsReauth ? (
        <GrantBanner
          characterId={activeCharacterId}
          endpoints={['getCharacterContacts']}
          title={t('contacts.reauthTitle')}
          hint={t('contacts.reauthHint')}
          actionLabel={t('contacts.reauthAction')}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !contactsResult || contacts.length === 0 ? (
        <CachedEmptyState
          result={contactsResult}
          title={t('contacts.emptyTitle')}
          hint={t('contacts.emptyHint')}
          fetchedTitle={t('contacts.emptyFetchedTitle')}
        />
      ) : (
        <Panel padded={false}>
          {contactsResult.fromCache && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.offlineTitle')}
            </p>
          )}
          {contactsTruncated && (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')}
            </p>
          )}
          {filteredContacts.length === 0 ? (
            <EmptyState
              title={t('contacts.noResults')}
              hint={t('contacts.noResultsHint')}
              className="py-8"
              action={
                activeContactsFilterCount(filter) > 0 ? (
                  <Button size="sm" onClick={() => setFilter(EMPTY_CONTACTS_FILTER)}>
                    {t('common.resetFilters')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <DataTable
              label={t('contacts.title')}
              columns={columns}
              rows={filteredContacts}
              rowKey={(contact) => contact.contact_id}
              {...characterSortProps}
              rowContextMenu={contactRowContextMenu}
            />
          )}
        </Panel>
      )}
    </div>
  );
}
