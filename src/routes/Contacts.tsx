import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
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
import { HintText } from '@/components/ui/HintText';
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
import { contactLabelNames, loadContactLabels, loadContacts } from '@/features/character/contacts';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport, type UseTableExport } from '@/components/ui/useTableExport';
import { contactsAcrossCsvColumns, contactsCsvColumns } from '@/features/character/contactsCsv';
import {
  ALL_CONTACT_KINDS,
  CONTACT_KIND_KEY,
  STANDING_CATEGORIES,
  EMPTY_CONTACTS_FILTER,
  activeContactsFilterCount,
  contactCountsByKind,
  contactCountsByStanding,
  contactKind,
  contactPublicInfoKind,
  contactTypeLabelKey,
  filterContacts,
  type ContactIdentity,
  type ContactKind,
  type ContactsFilter,
  type StandingCategory,
} from '@/features/character/contactsFilter';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { allianceLogoUrl, characterPortraitUrl, corporationLogoUrl } from '@/lib/eveImages';
import { usePublicInfoModal } from '@/stores/publicInfoModal';
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
import { tabBarTabs } from '@/lib/pageTabs';
import { ContactsStandings } from './ContactsStandings';

interface Snapshot {
  contactsResult: CachedResult<CharacterContact[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  contactsNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  contactsTruncated: boolean;
  contactNames: Map<number, string>;
  /** The character's in-game contact labels (id to name); empty when none or unreadable. */
  contactLabels: Map<number, string>;
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

/** What the table prints for an id whose name has not resolved — searchable, per `contactsFilter`. */
function entityName(names: ReadonlyMap<number, string>, id: number): string {
  return names.get(id) ?? `#${id}`;
}

/** Stable identities, so a fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_LABELS: ReadonlyMap<number, string> = new Map();
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
  const contactLabels = await loadContactLabels(characterId);
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
    contactLabels,
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
  type: Record<ContactKind, number>;
}

/**
 * A contact's face: a pilot's portrait, a corp's or alliance's logo. A faction
 * has no image on CCP's image server, so it gets a glyph in the same box. Its
 * own column, pinned to the phone card's left edge (`stackEdge`) so it sits
 * beside both lines; decorative, since the name beside it says who it is.
 */
function ContactPortrait({ contact }: { contact: ContactIdentity }) {
  // `max-w-none`: the cell is `w-0` (a tight desktop column, and pinned out of
  // flow on the phone card), and the base `img { max-width: 100% }` would
  // otherwise collapse the portrait to nothing.
  const box = 'block size-6 max-w-none shrink-0 rounded-xs border border-line';
  if (contact.contact_type === 'faction') {
    return (
      <span aria-hidden className={cx(box, 'flex items-center justify-center text-text-dim')}>
        <Icon.Faction size={ICON_SIZE.sm} />
      </span>
    );
  }
  const src =
    contact.contact_type === 'character'
      ? characterPortraitUrl(contact.contact_id, 64)
      : contact.contact_type === 'corporation'
        ? corporationLogoUrl(contact.contact_id, 64)
        : allianceLogoUrl(contact.contact_id, 64);
  return (
    <img
      src={src}
      alt=""
      width={24}
      height={24}
      loading="lazy"
      crossOrigin="anonymous"
      className={cx(box, 'bg-panel-2')}
    />
  );
}

/**
 * The name, with an "NPC" tag for an agent or NPC corp — the written word, in
 * the micro-heading treatment rather than a box (DESIGN.md §6), carries it.
 * `flags`, when given, ride beside the name on the phone card only: there the
 * Flags column is hidden, and a blocked or watched mark belongs with the name
 * it is about rather than at the end of the meta line.
 */
function ContactNameCell({
  contact,
  name,
  flags,
}: {
  contact: ContactIdentity;
  name: string;
  flags?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      <span className="truncate">{name}</span>
      {contactKind(contact) === 'npc' && (
        <span className="shrink-0 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('contacts.npcBadge')}
        </span>
      )}
      {flags && <span className="inline-flex shrink-0 sm:hidden">{flags}</span>}
    </span>
  );
}

/** A contact's blocked/watched marks, or null for neither. */
function ContactFlags({ contact }: { contact: CharacterContact }) {
  const { t } = useTranslation();
  const blocked = contact.is_blocked === true;
  const watched = contact.is_watched === true;
  if (!blocked && !watched) return null;
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
}

/**
 * A value the phone's dense card can do without (`data-dense-omit`,
 * index.css): an empty cell's dash, which reads as "none" in a table column
 * but would print as one more "· —" on the meta line, or a word the card
 * already says another way. The card hides a cell holding nothing else.
 */
function DenseOmit({ children }: { children: ReactNode }) {
  return <span data-dense-omit>{children}</span>;
}

function EmptyCell() {
  return <DenseOmit>—</DenseOmit>;
}

/** The portrait column both tables lead with: no header, never sorted, never hidden. */
function portraitColumn<T>(identity: (row: T) => ContactIdentity): DataTableColumn<T> {
  return {
    id: 'portrait',
    header: '',
    className: 'w-0 pr-0',
    stackEdge: 'start',
    render: (row) => <ContactPortrait contact={identity(row)} />,
  };
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
            {ALL_CONTACT_KINDS.map((type) => (
              <FilterChip
                key={type}
                label={t(CONTACT_KIND_KEY[type])}
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
    <span className={cx('inline-flex min-w-0 items-center gap-1.5', dim && 'text-text-dim')}>
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
  types: enumSetParam(ALL_CONTACT_KINDS),
  standing: enumSetParam(STANDING_CATEGORIES),
  'across.disagree': boolParam(),
};
const CHARACTER_SORT = { columnId: 'standing', direction: 'desc' } as const;

/** An Across row as the identity the shared helpers read. */
function acrossIdentity(row: AcrossCharactersRow): ContactIdentity {
  return { contact_id: row.contactId, contact_type: row.contactType };
}

const ACROSS_PORTRAIT_COLUMN = portraitColumn<AcrossCharactersRow>(acrossIdentity);
const CHARACTER_PORTRAIT_COLUMN = portraitColumn<CharacterContact>((contact) => contact);

/**
 * A faction row has no Show Info (no public faction endpoint), so it must not
 * look clickable: the row's own `cursor-pointer` is overridden, not removed —
 * `onRowClick` is table-wide.
 */
const NOT_CLICKABLE = 'cursor-default!';
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
  /** Reports the currently filtered rows up, so the page header's export (issue #2164) can read this tab's own rows without owning its fetch/merge state. The export itself reads them in the table's on-screen sort. */
  onVisibleRowsChange: (rows: readonly AcrossCharactersRow[]) => void;
  /** Reports whether any list behind the current merge is truncated, so the CSV export's filename can carry the same "-partial" suffix the Character tab's own truncated export does. */
  onTruncatedChange: (truncated: boolean) => void;
  /** The page header's export button for this tab, so the table's row menus export the same rows. */
  tableExport: UseTableExport<AcrossCharactersRow>;
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
  onVisibleRowsChange,
  onTruncatedChange,
  tableExport,
}: AcrossCharactersPanelProps) {
  const { t } = useTranslation();
  const { open } = usePublicInfoModal();
  const [fetched, setFetched] = useState<readonly CharacterContactList[] | null>(null);
  const [fetching, setFetching] = useState(false);

  const effectiveLists = fetched ?? lists;
  const rows = useMemo(() => mergeContactsAcrossCharacters(effectiveLists), [effectiveLists]);
  const disagreementCount = useMemo(() => rows.filter((row) => row.disagrees).length, [rows]);
  useEffect(
    () => onDisagreementCountChange(disagreementCount),
    [disagreementCount, onDisagreementCountChange]
  );
  // Any one character's own fetch stopping short makes the whole merge
  // incomplete — the export's "-partial" suffix (issue #2164) has to cover
  // that the same way the Character tab's own truncation does.
  const truncated = useMemo(() => effectiveLists.some((list) => list.truncated), [effectiveLists]);
  useEffect(() => onTruncatedChange(truncated), [truncated, onTruncatedChange]);

  const text = filter.text.trim().toLowerCase();
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (disagreementsOnly && !row.disagrees) return false;
        if (!filter.types.has(contactKind(acrossIdentity(row)))) return false;
        if (text === '') return true;
        return entityName(names, row.contactId).toLowerCase().includes(text);
      }),
    [rows, disagreementsOnly, filter.types, text, names]
  );
  useEffect(() => onVisibleRowsChange(visibleRows), [visibleRows, onVisibleRowsChange]);

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
  // Memoized so the `sortValue`s `DataTable` keys its sort on keep their
  // identity across renders (a keystroke in the filter re-renders this).
  const acrossListCount = effectiveLists.length;
  const optionalColumns = useMemo<
    Record<ContactsAcrossColumnId, DataTableColumn<AcrossCharactersRow>>
  >(
    () => ({
      type: {
        id: 'type',
        header: t('contacts.type'),
        className: 'text-text-dim',
        // As the character table: a player's or agent's type stays off the phone card.
        render: (row) => {
          const label = t(contactTypeLabelKey(acrossIdentity(row)));
          return row.contactType === 'character' ? <DenseOmit>{label}</DenseOmit> : label;
        },
        sortValue: (row) => t(contactTypeLabelKey(acrossIdentity(row))),
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
                total: acrossListCount,
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
        // The phone card's headline, as Standing is on the character table.
        cardCorner: true,
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
    }),
    [t, acrossListCount]
  );
  const nameColumn = useMemo<DataTableColumn<AcrossCharactersRow>>(
    () => ({
      id: 'name',
      header: t('contacts.name'),
      primary: true,
      render: (row) => (
        <ContactNameCell contact={acrossIdentity(row)} name={entityName(names, row.contactId)} />
      ),
      sortValue: (row) => entityName(names, row.contactId),
    }),
    [t, names]
  );
  const columns: DataTableColumn<AcrossCharactersRow>[] = [
    ACROSS_PORTRAIT_COLUMN,
    nameColumn,
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
          {...tableExport.tableProps}
          label={t('contacts.acrossLabel')}
          columns={columns}
          rows={visibleRows}
          rowKey={(row) => `${row.contactType}:${row.contactId}`}
          {...sortProps}
          mobileSort
          stackLayout="dense"
          onRowClick={(row) => {
            const kind = contactPublicInfoKind(acrossIdentity(row));
            if (kind) open(kind, row.contactId);
          }}
          rowClassName={(row) =>
            contactPublicInfoKind(acrossIdentity(row)) ? undefined : NOT_CLICKABLE
          }
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
  // Rows derive from a deferred copy so a keystroke paints the box first
  // (`useUrlFilter`'s rule); the bar and its setter keep the immediate one.
  const rowsFilter = useDeferredValue(filter);
  const setFilter = (next: ContactsFilter) =>
    setFilterParams({ q: next.text, types: next.types, standing: next.standings });
  const [tab, setTab] = usePageTab(CONTACTS_TABS);
  const { open: openPublicInfo } = usePublicInfoModal();

  // Lifted out of `AcrossCharactersPanel` (issue #1282): its chip now lives in
  // the shared `ContactsFilterBar`, which neither tab's panel owns.
  const disagreementsOnly = filterParams['across.disagree'];
  const setDisagreementsOnly = (next: boolean) => setFilterParams({ 'across.disagree': next });
  const [disagreementCount, setDisagreementCount] = useState(0);
  // Lifted the same way `disagreementCount` is (issue #2164): the page
  // header's CSV export needs the Across tab's own filtered rows, and only
  // `AcrossCharactersPanel` has the fetch state (`effectiveLists`) they come
  // from.
  const [acrossVisibleRows, setAcrossVisibleRows] = useState<readonly AcrossCharactersRow[]>([]);
  const [acrossTruncated, setAcrossTruncated] = useState(false);

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
  const contactLabels = data?.contactLabels ?? NO_LABELS;
  // A character with no labels sees no Labels column at all — neither in the
  // table nor in the picker — so the table is exactly what it was.
  const hasLabels = contactLabels.size > 0;
  const affiliations = data?.affiliations ?? NO_AFFILIATIONS;
  const acrossLists = data?.acrossLists ?? NO_LISTS;
  const ownAffiliation = data?.ownAffiliation ?? NO_OWN_AFFILIATION;

  const contacts = useMemo(() => contactsResult?.data ?? [], [contactsResult]);

  const counts = useMemo(
    () => ({
      standing: contactCountsByStanding(contacts),
      type: contactCountsByKind(contacts),
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
    () => filterContacts(contacts, rowsFilter, contactNames),
    [contacts, rowsFilter, contactNames]
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
        // A player's "Player" and an NPC's "NPC agent" add nothing to the
        // phone card — the NPC tag beside the name already tells them apart —
        // so only a corp, alliance or faction says what it is there.
        render: (contact) => {
          const label = t(contactTypeLabelKey(contact));
          return contact.contact_type === 'character' ? <DenseOmit>{label}</DenseOmit> : label;
        },
        // Sorts on what is printed, not on ESI's word for it — otherwise
        // "Player" would sort under C and "Corp" under C too, by accident.
        sortValue: (contact) => t(contactTypeLabelKey(contact)),
      },
      affiliation: {
        id: 'affiliation',
        header: t('contacts.affiliation'),
        headerTooltip: t('contacts.affiliationHeaderTooltip'),
        render: (contact) => {
          const row = affiliationRows.get(contact.contact_id);
          if (!row || row.corporationId === null) return <EmptyCell />;
          const alsoVia = row.alsoVia;
          // Stacked in the table; one line, `·`-joined, on the phone's dense card.
          return (
            <span className="inline min-w-0 sm:flex sm:flex-col sm:items-start">
              <AffiliationLine
                name={entityName(contactNames, row.corporationId)}
                own={row.inOwnCorporation}
                ownLabel={t('contacts.ownCorporation')}
                alsoVia={alsoVia?.source === 'corporation' ? alsoVia : null}
              />
              {row.allianceId !== null && (
                <span aria-hidden className="sm:hidden">
                  {' · '}
                </span>
              )}
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
      labels: {
        id: 'labels',
        header: t('contacts.labels'),
        // One line however many labels or however long: the full list is the
        // cell's tooltip, so truncation hides nothing.
        render: (contact) => {
          const names = contactLabelNames(contact, contactLabels);
          if (names.length === 0) return <EmptyCell />;
          const text = names.join(', ');
          return (
            <HintText content={text} className="inline-block max-w-56 truncate align-bottom">
              {text}
            </HintText>
          );
        },
        sortValue: (contact) => contactLabelNames(contact, contactLabels)[0],
      },
      standing: {
        id: 'standing',
        header: t('contacts.standing'),
        align: 'center',
        // The phone card's headline: the one thing a contact list is scanned by.
        cardCorner: true,
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
        // On the phone card the marks ride beside the name instead
        // (`ContactNameCell`). `!`: the dense card's own cell rule would
        // otherwise outrank a plain utility.
        className: 'max-sm:hidden!',
        render: (contact) =>
          contact.is_blocked === true || contact.is_watched === true ? (
            <ContactFlags contact={contact} />
          ) : (
            <EmptyCell />
          ),
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
    [t, contactNames, contactLabels, affiliationRows]
  );
  // The ids the table and picker offer: `labels` only when there is something to show.
  const availableCharacterColumnIds = useMemo(
    () => CONTACTS_CHARACTER_COLUMN_IDS.filter((id) => id !== 'labels' || hasLabels),
    [hasLabels]
  );
  const flagsVisible = characterColumnVisibility.isVisible('flags');
  const columns = useMemo<DataTableColumn<CharacterContact>[]>(
    () => [
      CHARACTER_PORTRAIT_COLUMN,
      {
        id: 'name',
        header: t('contacts.name'),
        primary: true,
        render: (contact) => (
          <ContactNameCell
            contact={contact}
            name={contactNames.get(contact.contact_id) ?? `#${contact.contact_id}`}
            flags={flagsVisible && <ContactFlags contact={contact} />}
          />
        ),
        sortValue: (contact) => contactNames.get(contact.contact_id) ?? `#${contact.contact_id}`,
      },
      ...availableCharacterColumnIds
        .filter(characterColumnVisibility.isVisible)
        .map((id) => optionalCharacterColumns[id]),
    ],
    [
      t,
      flagsVisible,
      contactNames,
      optionalCharacterColumns,
      availableCharacterColumnIds,
      characterColumnVisibility.isVisible,
    ]
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
        available={availableCharacterColumnIds}
        visible={characterColumnVisibility.visible}
        columnsById={optionalCharacterColumns}
        onToggle={characterColumnVisibility.toggle}
        buttonLabel={t('common.columnsButton')}
        menuTitle={t('common.columnsMenuTitle')}
        onReset={characterColumnVisibility.reset}
        resetLabel={t('common.resetColumns')}
      />
    );

  // One export button in the page header, exporting whichever tab's table is showing —
  // each tab keeps its own surface so the two files never share a name.
  const characterCsvColumns = useMemo(
    () => contactsCsvColumns(t, contactNames, affiliationRows),
    [t, contactNames, affiliationRows]
  );
  const characterExport = useTableExport({
    surface: 'contacts',
    rows: filteredContacts,
    columns: characterCsvColumns,
    truncated: contactsTruncated,
  });
  const acrossCsvColumns = useMemo(
    () => contactsAcrossCsvColumns(t, contactNames),
    [t, contactNames]
  );
  const acrossExport = useTableExport({
    surface: 'contacts-across',
    rows: acrossVisibleRows,
    columns: acrossCsvColumns,
    truncated: acrossTruncated,
  });
  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  // One Character's roster has nothing to compare against, so no "Across characters" tab.
  const tabBar = (
    <Tabs
      label={t('contacts.title')}
      value={tab}
      onChange={(id) => setTab(id as typeof tab)}
      tabs={tabBarTabs(CONTACTS_TABS)
        .filter((item) => item.id !== 'across' || acrossLists.length > 1)
        .map((item) => ({ id: item.id, label: t(item.labelKey) }))}
    />
  );
  if (tab === 'standings') {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <ContactsStandings characterId={activeCharacterId} tabBar={tabBar} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('contacts.title')}
        meta={contactsResult && <DataAgeBadge date={contactsResult.fetchedAt} />}
        actions={
          <>
            {/* One character is the whole roster: nothing to compare it against,
                so there is no "All characters" to offer. */}
            {acrossLists.length > 1 && (
              <CharacterFilterControl
                activeCharacterId={activeCharacterId}
                value={view === 'across' ? 'all' : 'current'}
                onChange={(next) => setTab(next === 'all' ? 'across' : 'character')}
                size="md"
              />
            )}
            {view === 'across' ? (
              <TableActionsMenu
                name={t('contacts.tabAcrossCharacters')}
                tableExport={acrossExport}
                size="md"
              />
            ) : (
              <TableActionsMenu
                name={t('contacts.title')}
                tableExport={characterExport}
                size="md"
              />
            )}
            <IconButton
              icon={<Icon.Refresh />}
              label={t('contacts.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />

      {tabBar}

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
          filter={rowsFilter}
          disagreementsOnly={disagreementsOnly}
          onDisagreementCountChange={setDisagreementCount}
          isColumnVisible={acrossColumnVisibility.isVisible}
          onVisibleRowsChange={setAcrossVisibleRows}
          onTruncatedChange={setAcrossTruncated}
          tableExport={acrossExport}
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
              {...characterExport.tableProps}
              label={t('contacts.title')}
              columns={columns}
              rows={filteredContacts}
              rowKey={(contact) => contact.contact_id}
              {...characterSortProps}
              mobileSort
              stackLayout="dense"
              onRowClick={(contact) => {
                const kind = contactPublicInfoKind(contact);
                if (kind) openPublicInfo(kind, contact.contact_id);
              }}
              rowClassName={(contact) =>
                contactPublicInfoKind(contact) ? undefined : NOT_CLICKABLE
              }
            />
          )}
        </Panel>
      )}
    </div>
  );
}
