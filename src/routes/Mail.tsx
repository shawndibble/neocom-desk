import {
  focusRingInsetClassName,
  interactiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  CachedEmptyState,
  EmptyState,
  FilterChip,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Spinner,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner, GrantNote } from '@/app/GrantNote';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { CharacterLink } from '@/features/entities';
import { StandingTag } from '@/features/character/StandingTag';
import {
  loadMailHeaders,
  loadMailBody,
  loadMailOwner,
  loadMoreMailHeaders,
  markMailReadOnEsi,
  readMailLabelsForCharacters,
  type MailOwnerLoad,
} from '@/features/character/mail';
import { loadMailForCharacters, type SkippedMailCharacter } from '@/features/character/mailAll';
import { useMailScope } from '@/features/character/mailScopePref';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import type { CharacterFilterValue } from '@/features/character/characterFilterValue';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { loadContacts } from '@/features/character/contacts';
import { MailComposeBox } from '@/features/character/MailComposeBox';
import {
  buildContactStandingIndex,
  type ContactStandingIndex,
} from '@/features/character/contactStandings';
import { resolveAffiliations } from '@/features/character/affiliations';
import { characterStanding } from '@/features/character/entityStanding';
import type { CachedResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useFocusHeading } from '@/lib/useFocusHeading';
import {
  useViewportBoundedHeight,
  VIEWPORT_BOUNDED_BOTTOM_GAP_PX,
} from '@/lib/useViewportBoundedHeight';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import { useMailFolders } from '@/features/character/mailFolderPref';
import { cx } from '@/lib/cx';
import { useUrlParams } from '@/lib/useUrlState';
import { boolParam, textParam } from '@/lib/urlState';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly, formatTimestamp } from '@/lib/timestamp';
import {
  buildLabelTabMap,
  capHeadersForDisplay,
  mailKey,
  mailSearchMatches,
  mergeOwnedMail,
  resolveMailTab,
  sumUnreadByTab,
  totalSystemUnread,
  MAIL_FOLDERS,
  type ComposeKind,
  type MailTab,
} from '@/engine/mail';
import type {
  CharacterAffiliation,
  MailBody,
  MailHeader,
  MailLabel,
  MailingList,
} from '@/esi/endpoints';

// Matches Market.tsx's/SkillPicker.tsx's/Assets.tsx's own search debounce.
const SEARCH_DEBOUNCE_MS = 250;

const SEARCH_PARAM = textParam();
const HIDE_READ_PARAM = boolParam();
const MAIL_FILTER_PARAMS = { search: SEARCH_PARAM, hideRead: HIDE_READ_PARAM };

const TAB_LABEL_KEY: Record<MailTab, string> = {
  inbox: 'mail.tabInbox',
  sent: 'mail.tabSent',
  corp: 'mail.tabCorp',
  alliance: 'mail.tabAlliance',
};

/**
 * The glyph a row wears instead of the old uppercase text tag.
 *
 * A glyph rather than a per-folder colour on purpose (see
 * `docs/context/decisions/`, "Mail rows go two-line"): Inbox/Sent/Corp/
 * Alliance is a *nominal* set — no order, no severity — and every colour scale
 * in this app is ordinal or semantic (`securityStatusColor`, `STANDING_TONE`,
 * the order-problem severity ladder). Four hues here would encode identity
 * alone, which DESIGN.md §6 calls decoration, and in a palette where cyan is
 * already "interactive" they would read as status and read wrong.
 */
const FOLDER_ICON: Record<MailTab, typeof Icon.Corporation> = {
  inbox: Icon.MailInbox,
  sent: Icon.MailSent,
  corp: Icon.Corporation,
  alliance: Icon.MailAlliance,
};

/** One mailbox's slice of a snapshot: the single view has exactly one, the All view one per covered Character. */
interface OwnerSnapshot {
  characterId: number;
  name: string;
  /** Null only in the single view, when nothing is cached and the fetch failed. */
  headersResult: CachedResult<MailHeader[]> | null;
  labels: readonly MailLabel[];
  /** `label_id` differs per Character, so each mailbox resolves its own folders. */
  labelTabById: ReadonlyMap<number, MailTab>;
  /** True when a `last_mail_id` page beyond this list may exist (issue #161). */
  hasMore: boolean;
  /**
   * This Character's own contact list, indexed once per snapshot. Empty
   * (never missing) when the contacts scope isn't granted — a stranger's tag
   * is simply absent, not an error the page needs to surface.
   */
  standingIndex: ContactStandingIndex;
}

interface Snapshot {
  owners: OwnerSnapshot[];
  /** All view only: Characters left out, for the scope readout and their grant notes. */
  skipped: SkippedMailCharacter[];
  /** 401/403 (or a failed token refresh) on any call means "log in again", not "offline". Single view only. */
  needsReauth: boolean;
  /** Sender + non-mailing-list recipient names, resolved together in one batch. */
  names: Map<number, string>;
  /** Every covered Character's mailing lists — list ids are global, so one map names them all (issue #416). */
  mailingLists: MailingList[];
  /** Each sender's corp/alliance/faction, so a sender with no personal contact entry can still match one the pilot holds on their corp. Senders only — Mail's standing tag is scoped to "who sent this", not every recipient. */
  senderAffiliations: Map<number, CharacterAffiliation>;
}

/** Stable identity for the loading/failed fallback, so it doesn't churn every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_OWNERS: readonly OwnerSnapshot[] = [];
const NO_MAILING_LISTS: readonly MailingList[] = [];
const NO_STANDING_INDEX: ContactStandingIndex = new Map();
const NO_AFFILIATIONS: ReadonlyMap<number, CharacterAffiliation> = new Map();
const NO_HAS_MORE: ReadonlyMap<number, boolean> = new Map();

/**
 * Sender + recipient ids to look up for these headers. Mailing-list recipient
 * ids are excluded: `/universe/names` can't resolve them and fails the whole
 * batch on an unresolvable id, which would blank every other name in the same
 * mail.
 */
function namePartyIds(headers: readonly MailHeader[]): number[] {
  return headers.flatMap((header) => [
    ...(header.from !== undefined ? [header.from] : []),
    ...(header.recipients ?? [])
      .filter((r) => r.recipient_type !== 'mailing_list')
      .map((r) => r.recipient_id),
  ]);
}

/** Senders only — the standing tag is scoped to "who sent this", never a recipient. */
function senderIds(headers: readonly MailHeader[]): number[] {
  return headers.flatMap((header) => (header.from !== undefined ? [header.from] : []));
}

interface LoadedOwner {
  characterId: number;
  name: string;
  load: MailOwnerLoad;
}

async function buildSnapshot(
  loaded: readonly LoadedOwner[],
  skipped: SkippedMailCharacter[],
  needsReauth: boolean,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const allHeaders = loaded.flatMap((o) => o.load.headers?.data ?? []);
  // Already superseded: skip the name/standing lookups, their results would be discarded.
  const ids = signal.cancelled ? [] : namePartyIds(allHeaders);
  const senders = signal.cancelled ? [] : senderIds(allHeaders);
  const [names, contacts, senderAffiliations] = await Promise.all([
    resolveNames(ids),
    Promise.all(
      loaded.map((o) => (signal.cancelled ? Promise.resolve(null) : loadContacts(o.characterId)))
    ),
    resolveAffiliations(senders),
  ]);
  const owners = loaded.map((o, i): OwnerSnapshot => {
    const labels = o.load.labels?.data.labels ?? [];
    return {
      characterId: o.characterId,
      name: o.name,
      headersResult: o.load.headers,
      labels,
      labelTabById: buildLabelTabMap(labels),
      hasMore: o.load.hasMore,
      standingIndex: buildContactStandingIndex(contacts[i]?.cached?.data ?? []),
    };
  });
  return {
    owners,
    skipped,
    needsReauth,
    names,
    mailingLists: loaded.flatMap((o) => o.load.lists),
    senderAffiliations,
  };
}

async function loadMailSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const load = await loadMailOwner(characterId);
  return buildSnapshot([{ characterId, name: '', load }], [], load.needsReauth, signal);
}

/** The All view: every Character's mailbox, through the per-Character throttle (`mailAll.ts`). */
async function loadAllMailSnapshot(
  _characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const characters = await db.characters.toArray();
  const { owners, skipped } = await loadMailForCharacters(characters);
  return buildSnapshot(
    owners.map((o) => ({ characterId: o.characterId, name: o.name, load: o })),
    skipped,
    false,
    signal
  );
}

/** A list row: one mail, tagged with whose mailbox it sits in. `mail_id` repeats across mailboxes, `key` does not. */
interface MailRow {
  key: string;
  ownerId: number;
  ownerName: string;
  header: MailHeader;
  tab: MailTab;
}

interface MailViewProps {
  scope: CharacterFilterValue;
  /** The This/All picker (with per-Character unread), null when there is one Character to offer. */
  scopeControl: ReactNode;
}

/** Mail's two-pane client for one scope: list beside reading pane, each scrolling independently (CONTEXT.md round 18). */
function MailView({ scope, scopeControl }: MailViewProps) {
  const { t } = useTranslation();
  const isAll = scope === 'all';
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    isAll ? loadAllMailSnapshot : loadMailSnapshot,
    undefined,
    { cacheKey: isAll ? 'mail-all' : 'mail' }
  );

  // Which folders the list shows. Remembered across visits and device-wide
  // (`mailFolderPref.ts`) — a deliberate promotion from the in-memory,
  // per-character tab memory this replaces. That tier was fine for a tab:
  // forgetting it put you back on All, which hid nothing. A folder filter
  // whose whole point is "stop showing me Sent" has not granted the request
  // if it forgets by the next reload.
  // An array all the way through, not a Set at the point of use: Dexie stores
  // plain structured-cloneable values, so the stored shape is an array either
  // way, and at four possible members a linear scan beats the two hooks it
  // takes to keep a memoised Set's identity stable.
  const folders = useMailFolders((state) => state.value);
  const setFolders = useMailFolders((state) => state.setValue);
  const hydrateFolders = useMailFolders((state) => state.hydrate);
  useEffect(() => {
    void hydrateFolders();
  }, [hydrateFolders]);
  function toggleFolder(folder: MailTab) {
    void setFolders(
      folders.includes(folder) ? folders.filter((f) => f !== folder) : [...folders, folder]
    );
  }

  // The open mail, as owner + `mail_id`: the id alone repeats across mailboxes.
  const [selected, setSelected] = useState<{
    ownerId: number;
    mailId: number;
    key: string;
  } | null>(null);
  const selectedKey = selected?.key ?? null;
  // Which compose box is open, if any (mail-reply-and-forward decision) —
  // reset below whenever the selected mail changes, so switching mails never
  // leaves a stale Reply/Forward box open against the wrong header.
  const [composeKind, setComposeKind] = useState<ComposeKind | null>(null);
  function selectMail(target: { ownerId: number; mailId: number } | null) {
    setSelected(target && { ...target, key: mailKey(target.ownerId, target.mailId) });
    setComposeKind(null);
  }

  // Focus management below the `lg:` breakpoint (issue #1485), where opening
  // a mail hides the list Panel and Back hides the reader Panel again — both
  // CSS `hidden`, not an unmount, so nothing here needs a mount effect, only
  // a place to land focus once the swap has happened.
  const isDesktop = useIsDesktop();
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The exact row button last clicked to open a mail — a DOM node, not a
  // mail id + `querySelector`, so a row the "Hide read" filter has since
  // removed from the list is simply not `.isConnected` rather than matching
  // some other row that happens to share an id after a re-render.
  const openedRowRef = useRef<HTMLButtonElement | null>(null);
  // Reader heading focus: fires once `body` has actually resolved for the
  // newly selected mail, not the instant `selectedKey` changes — focusing a
  // still-loading pane would land on a spinner, not the subject the pilot
  // asked to read. `null` on desktop (both panes stay on screen; the clicked
  // row already keeps its own focus there) and while nothing is selected.
  const readerHeadingRef = useRef<HTMLElement>(null);
  function selectMailFromRow(target: { ownerId: number; mailId: number }, row: HTMLButtonElement) {
    openedRowRef.current = row;
    selectMail(target);
  }
  // Back-to-list focus restore: only when the pilot actually pressed Back
  // (captured below), never for an unrelated `selectedKey` reset — e.g.
  // switching characters, which also lands on `selectedKey === null`.
  const backToListRef = useRef(false);
  function handleBackToList() {
    backToListRef.current = true;
    selectMail(null);
  }
  useEffect(() => {
    if (selectedKey !== null) return;
    // Cleared unconditionally the moment `selectedKey` goes null, before the
    // `isDesktop` check below — otherwise a resize straight after the Back
    // click (landing between the click and this effect's commit) could skip
    // the reset entirely, leaving a stale flag that a later, unrelated
    // `selectedKey` reset (a character switch) would misread as "Back was
    // pressed" and wrongly steal focus for.
    const wasBackPressed = backToListRef.current;
    backToListRef.current = false;
    if (!wasBackPressed || isDesktop) return;
    const row = openedRowRef.current;
    if (row && row.isConnected) row.focus();
    else searchInputRef.current?.focus();
  }, [selectedKey, isDesktop]);

  // Reply/Forward focus restore (issue #1485): both buttons unmount the
  // instant `composeKind` is set (replaced by the compose box in the same
  // spot), so Cancel/Send — which unmount the compose box in turn — have
  // nothing to hand focus back to unless it's remembered up front. Records
  // which button opened it and which mail it opened it for; a mail switch
  // clears `composeKind` too (see `selectMail`), and that must NOT steal
  // focus back to a Reply/Forward button on a mail the pilot has since left.
  const replyButtonRef = useRef<HTMLButtonElement>(null);
  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const composeOpenedFromRef = useRef<{ kind: ComposeKind; key: string } | null>(null);
  function openCompose(kind: ComposeKind, key: string) {
    composeOpenedFromRef.current = { kind, key };
    setComposeKind(kind);
  }
  useEffect(() => {
    if (composeKind !== null) return;
    const opened = composeOpenedFromRef.current;
    if (opened === null) return;
    composeOpenedFromRef.current = null;
    if (selectedKey !== opened.key) return;
    const button = opened.kind === 'reply' ? replyButtonRef.current : forwardButtonRef.current;
    button?.focus();
  }, [composeKind, selectedKey]);
  // Local "mark read" state, applied instantly on selection so the dim never
  // waits on the network — independent of `markMailReadOnEsi`'s own write
  // below. Set on selection, not toggled — no manual mark-unread control.
  const [locallyReadKeys, setLocallyReadKeys] = useState<ReadonlySet<string>>(new Set());
  function markLocalRead(key: string) {
    setLocallyReadKeys((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));
  }

  // Short-lived view state (ADR 0015): survives a reload, absent when default.
  const [filters, setFilters] = useUrlParams(MAIL_FILTER_PARAMS);
  const { search, hideRead } = filters;
  const setSearch = (value: string) => setFilters({ search: value });
  const setHideRead = (value: boolean) => setFilters({ hideRead: value });
  // Debounced separately from `search` (matches Assets.tsx/Market.tsx/
  // SkillPicker.tsx's own search debounce, issue #416): the input stays
  // instantly responsive, only the filter over potentially hundreds of
  // headers below waits out the debounce.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);
  const [bodySnapshot, setBodySnapshot] = useState<{
    key: string;
    result: CachedResult<MailBody> | null;
  } | null>(null);

  // Headers loaded via "load more" (issue #161) live outside useRouteSnapshot,
  // which only supports a full reload, not an incremental patch. `null` means
  // "no load-more yet this snapshot" — fall back to the snapshot's own lists.
  // Per Character: each mailbox pages by its own `last_mail_id`.
  const [loadedHeaders, setLoadedHeaders] = useState<ReadonlyMap<number, MailHeader[]> | null>(
    null
  );
  // Names for those headers: the snapshot only resolved the parties in its own
  // first page, so without this every row past it would read "Unknown".
  const [loadedNames, setLoadedNames] = useState<ReadonlyMap<number, string> | null>(null);
  // Same gap, for standing: the snapshot only resolved affiliations for its
  // own first page of senders, so without this an inherited (corp/alliance)
  // standing would silently never show past it — a personal contact entry
  // would still match (the index is id-keyed), which is what makes this easy
  // to miss in a quick look.
  const [loadedAffiliations, setLoadedAffiliations] = useState<Map<
    number,
    CharacterAffiliation
  > | null>(null);
  const [hasMoreByOwner, setHasMoreByOwner] = useState<ReadonlyMap<number, boolean>>(NO_HAS_MORE);
  const hasMore = [...hasMoreByOwner.values()].some(Boolean);
  const [loadingMore, setLoadingMore] = useState(false);
  // Reset for a new snapshot (character switch, manual refresh, or the
  // initial load) synchronously during render — the same "adjust state while
  // rendering" pattern useRouteSnapshot itself uses — so `hasMore` is already
  // correct on the very render that first shows this snapshot's headers,
  // instead of lagging a render behind through a useEffect.
  const [snapshotForHeaders, setSnapshotForHeaders] = useState<Snapshot | null>(null);
  if (data !== snapshotForHeaders) {
    setSnapshotForHeaders(data);
    setLoadedHeaders(null);
    setLoadedNames(null);
    setLoadedAffiliations(null);
    setHasMoreByOwner(new Map((data?.owners ?? []).map((o) => [o.characterId, o.hasMore])));
  }
  // Latest snapshot, readable from handleLoadMore's async closure after an
  // await — a stale closure over `data` would never see the character
  // switch or refresh that superseded the in-flight request.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  // The pilot's Local/EVE-time preference, the same way Contracts,
  // Notifications and Clones thread it into their own timestamps.
  const timeZone = useTimeZone();
  const [bodyScrollerRef, bodyMaxHeight] = useViewportBoundedHeight(VIEWPORT_BOUNDED_BOTTOM_GAP_PX);

  const owners = data?.owners ?? NO_OWNERS;
  const ownerById = useMemo(() => new Map(owners.map((o) => [o.characterId, o])), [owners]);
  // The first mailbox stands in for the whole view in the empty state: with
  // none cached anywhere there is nothing better to say about it.
  const headersResult = owners[0]?.headersResult ?? null;
  const offline = owners.some((o) => o.headersResult?.fromCache);
  // The oldest read governs: a view is only as fresh as its stalest mailbox.
  const fetchedAt = owners.reduce<Date | null>((oldest, o) => {
    const at = o.headersResult?.fetchedAt;
    return at && (oldest === null || at < oldest) ? at : oldest;
  }, null);
  const needsReauth = data?.needsReauth ?? false;
  const names = loadedNames ?? data?.names ?? NO_NAMES;
  const senderAffiliations = loadedAffiliations ?? data?.senderAffiliations ?? NO_AFFILIATIONS;
  const unreadByTab = useMemo(() => sumUnreadByTab(owners.map((o) => o.labels)), [owners]);
  const mailingListNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const list of data?.mailingLists ?? NO_MAILING_LISTS)
      map.set(list.mailing_list_id, list.name);
    return map;
  }, [data]);

  const rows = useMemo<MailRow[]>(
    () =>
      mergeOwnedMail(
        owners.map((o) => ({
          characterId: o.characterId,
          characterName: o.name,
          headers: loadedHeaders?.get(o.characterId) ?? o.headersResult?.data ?? [],
        }))
      ).map(({ ownerId, ownerName, header }) => ({
        key: mailKey(ownerId, header.mail_id),
        ownerId,
        ownerName,
        header,
        tab: resolveMailTab(header.labels, ownerById.get(ownerId)?.labelTabById ?? new Map()),
      })),
    [owners, ownerById, loadedHeaders]
  );

  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (!folders.includes(row.tab)) return false;
        const isRead = row.header.is_read || locallyReadKeys.has(row.key);
        if (hideRead && isRead) return false;
        const senderName = row.header.from === undefined ? undefined : names.get(row.header.from);
        return mailSearchMatches(row.header, senderName, debouncedSearch);
      }),
    [rows, folders, hideRead, locallyReadKeys, names, debouncedSearch]
  );

  // Rendered-list cap (issue #416): applied after every filter, so it caps
  // what's actually mapped into DOM rows rather than the underlying fetch
  // list — "load more"'s own pagination cursor is untouched by this.
  const { headers: cappedRows, truncated: headersTruncated } = useMemo(
    () => capHeadersForDisplay(visibleRows),
    [visibleRows]
  );

  // The list pane's three states, named once here rather than as a pair of
  // nested ternaries in the middle of the JSX — "empty because nothing matched"
  // and "empty because no folder is on" want different copy and only one of
  // them offers a way out.
  const listState =
    visibleRows.length > 0 ? 'rows' : folders.length === 0 ? 'no-folders' : 'no-matches';

  const selectedRow = rows.find((row) => row.key === selectedKey) ?? null;
  const selectedHeader = selectedRow?.header ?? null;
  const selectedOwner = selectedRow ? ownerById.get(selectedRow.ownerId) : undefined;
  // The open mail's mailbox is gone (character switch, scope flip, a refresh
  // that dropped it): close it rather than read someone else's body into it.
  if (selected !== null && data !== null && !ownerById.has(selected.ownerId)) selectMail(null);

  /**
   * A recipient's display name. A mailing list resolves through the
   * mailboxes' own lists rather than `/universe/names`, which cannot
   * resolve a list id at all (see `namePartyIds`).
   */
  function resolveRecipientName(r: { recipient_id: number; recipient_type: string }): string {
    return r.recipient_type === 'mailing_list'
      ? (mailingListNames.get(r.recipient_id) ?? t('mail.mailingList'))
      : (names.get(r.recipient_id) ?? t('mail.unknownRecipient'));
  }

  /** A header's recipients as display names. */
  function recipientNames(header: MailHeader): string[] {
    return (header.recipients ?? []).map(resolveRecipientName);
  }

  /** The same recipients, cut to one name plus a count — a list row has one line for them. */
  function recipientSummary(header: MailHeader): string {
    const all = recipientNames(header);
    if (all.length === 0) return t('mail.unknownRecipient');
    if (all.length === 1) return all[0];
    return t('mail.recipientMore', { name: all[0], count: all.length - 1 });
  }

  /** What each mailbox currently shows: its load-more list if it has one, else the snapshot's. */
  function currentHeadersOf(ownerId: number): MailHeader[] {
    return loadedHeaders?.get(ownerId) ?? ownerById.get(ownerId)?.headersResult?.data ?? [];
  }

  /**
   * Shared by `handleLoadMore` and `handleSent`: resolve names/affiliations
   * for fresh header lists and apply them, unless a character switch or
   * refresh already superseded `requestSnapshot` while this was in flight
   * (`dataRef` tracks the latest one).
   */
  async function applyFreshHeaders(
    requestSnapshot: Snapshot | null,
    fresh: ReadonlyMap<number, { headers: MailHeader[]; hasMore: boolean }>
  ) {
    const all = [...fresh.values()].flatMap((entry) => entry.headers);
    const [freshNames, freshAffiliations] = await Promise.all([
      resolveNames(namePartyIds(all)),
      resolveAffiliations(senderIds(all)),
    ]);
    if (dataRef.current !== requestSnapshot) return;
    setLoadedHeaders(new Map([...fresh].map(([id, entry]) => [id, entry.headers])));
    setHasMoreByOwner(new Map([...fresh].map(([id, entry]) => [id, entry.hasMore])));
    setLoadedNames(freshNames);
    setLoadedAffiliations(freshAffiliations);
  }

  /** One more page per mailbox that has one — a mailbox with nothing older is left as it is. */
  async function handleLoadMore() {
    if (owners.length === 0 || loadingMore) return;
    const requestSnapshot = data;
    setLoadingMore(true);
    try {
      const fresh = new Map<number, { headers: MailHeader[]; hasMore: boolean }>();
      await Promise.all(
        owners.map(async (owner) => {
          const current = currentHeadersOf(owner.characterId);
          fresh.set(
            owner.characterId,
            hasMoreByOwner.get(owner.characterId)
              ? await loadMoreMailHeaders(owner.characterId, current)
              : { headers: current, hasMore: false }
          );
        })
      );
      await applyFreshHeaders(requestSnapshot, fresh);
    } finally {
      setLoadingMore(false);
    }
  }

  /**
   * After a successful Reply/Forward send. `sendMail` already deleted the
   * cached headers row (mail-reply-and-forward decision: "a targeted
   * invalidation of one key, not a broader reload") — refetching just the
   * headers here is what shows the new Sent mail without a manual refresh
   * while keeping that promise. Not `refresh()`: it calls the cache's global
   * `invalidateFreshness()`, forcing every other default-tier row (labels,
   * mailing lists, contacts, affiliations) to refetch too. Only the sending
   * Character's mailbox is refetched; the others keep what they show.
   */
  async function handleSent(ownerId: number) {
    setComposeKind(null);
    const requestSnapshot = data;
    const result = await loadMailHeaders(ownerId);
    const fresh = new Map(
      owners.map((o) => [
        o.characterId,
        {
          headers: currentHeadersOf(o.characterId),
          hasMore: hasMoreByOwner.get(o.characterId) ?? false,
        },
      ])
    );
    fresh.set(ownerId, { headers: result.cached?.data ?? [], hasMore: result.hasMore });
    await applyFreshHeaders(requestSnapshot, fresh);
  }

  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    void loadMailBody(selected.ownerId, selected.mailId).then((result) => {
      if (!cancelled) setBodySnapshot({ key: selected.key, result });
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const body = bodySnapshot?.key === selectedKey ? bodySnapshot.result : undefined;
  // Stripped once, shared by the reading pane's own paragraph and the
  // compose box's auto-quote — both must quote exactly what the pilot reads.
  const bodyText = body?.data.body ? stripEveMarkup(body.data.body) : '';

  // `enabled: !isDesktop` — narrow-only; see `useFocusHeading`'s own doc
  // comment for why that's a separate param rather than folded into the key.
  // Off while composing too: Reply/Forward render from the header alone, so a
  // pilot can open one before the body loads — the compose box then mounts
  // with the body, and its own focus must not lose to this heading's.
  useFocusHeading(
    readerHeadingRef,
    body === undefined ? null : selectedKey,
    !isDesktop && composeKind === null
  );

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const showBackControl = !isDesktop && selectedKey !== null;
  const recipients = selectedHeader?.recipients ?? [];
  const selectedTab = selectedRow?.tab ?? 'inbox';
  const selectedSender =
    (selectedHeader?.from === undefined ? undefined : names.get(selectedHeader.from)) ??
    t('mail.unknownSender');

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('mail.title')}
        meta={
          <>
            {fetchedAt && <DataAgeBadge date={fetchedAt} />}
            {scopeControl}
            {isAll && data && data.skipped.length > 0 && (
              <CharacterScopeReadout
                scope="all"
                total={owners.length + data.skipped.length}
                missing={data.skipped.map((c) => c.name)}
              />
            )}
          </>
        }
        actions={
          <>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('mail.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />

      {isAll &&
        data?.skipped
          .filter((c) => !c.granted)
          .map((c) => (
            // Shown only while that Character's stored grant really lacks the mail scope.
            <GrantNote
              key={c.characterId}
              characterId={c.characterId}
              characterName={c.name}
              endpoints={['getCharacterMailHeaders']}
              title={t('mail.reauthTitle')}
              hint={t('mail.reauthHint')}
              actionLabel={t('mail.reauthAction')}
            />
          ))}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : needsReauth ? (
        <GrantBanner
          characterId={activeCharacterId}
          endpoints={['getCharacterMailHeaders']}
          title={t('mail.reauthTitle')}
          hint={t('mail.reauthHint')}
          actionLabel={t('mail.reauthAction')}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !headersResult || rows.length === 0 ? (
        <CachedEmptyState
          result={headersResult}
          title={t('mail.emptyTitle')}
          hint={t('mail.emptyHint')}
          fetchedTitle={t('mail.emptyFetchedTitle')}
        />
      ) : (
        <>
          {offline && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}

          {(isDesktop || selectedKey === null) && (
            // A toggle-button group, not a tablist: `aria-selected` on a tab
            // promises exactly one visible panel, which stops being true the
            // moment two folders can be on at once. `aria-pressed` on a real
            // button inside a `role="group"` is the APG toggle idiom, and the
            // shape Contacts and Open Orders already ship. Losing the tab
            // bar's arrow-key roving focus is correct rather than a
            // regression — each chip is its own tab stop now.
            <div
              role="group"
              aria-label={t('mail.foldersLabel')}
              className="flex flex-wrap items-center gap-2"
            >
              {MAIL_FOLDERS.map((folder) => {
                // Each System Label's own `unread_count`, never summed across
                // the selected folders: round 18 recorded that these come from
                // ESI as-is, and `total_unread_count` is not their sum once
                // Custom Labels exist, so a client-side total would disagree
                // with the number the game itself shows. The All view sums
                // the same per-label figure across Characters (issue #2867).
                const unread = unreadByTab.get(folder) ?? 0;
                return (
                  <FilterChip
                    key={folder}
                    size="md"
                    label={t(TAB_LABEL_KEY[folder])}
                    // Zero is shown, not dimmed away as Open Orders dims a
                    // zero-match chip: there, zero means "nothing to do"; here
                    // a folder with no unread mail is exactly where you go to
                    // re-read something, and Sent reports zero unread forever.
                    count={unread > 0 ? unread : undefined}
                    countLabel={unread > 0 ? t('mail.unreadCount', { count: unread }) : undefined}
                    selected={folders.includes(folder)}
                    onToggle={() => toggleFolder(folder)}
                  />
                );
              })}
            </div>
          )}

          {(isDesktop || selectedKey === null) && (
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('mail.searchPlaceholder')}
                aria-label={t('mail.searchLabel')}
                className="min-w-0 flex-1"
              />
              <FilterChip
                label={t('mail.hideRead')}
                selected={hideRead}
                onToggle={() => setHideRead(!hideRead)}
                size="md"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr] lg:items-start xl:grid-cols-[24rem_1fr]">
            <Panel padded={false} className={isDesktop || selectedKey === null ? '' : 'hidden'}>
              {listState === 'no-folders' ? (
                // Deselecting every folder is allowed rather than refused — a
                // chip that visibly ignores a press is worse than an empty list
                // that explains itself and hands back the way out. The chip row
                // above sits outside this branch, so the control that undoes it
                // never disappears along with the rows.
                <EmptyState
                  title={t('mail.noFoldersTitle')}
                  hint={t('mail.noFoldersHint')}
                  className="py-6"
                  action={
                    <Button size="sm" onClick={() => void setFolders(MAIL_FOLDERS)}>
                      {t('mail.showAllFolders')}
                    </Button>
                  }
                />
              ) : listState === 'no-matches' ? (
                <EmptyState
                  title={t('mail.noMatchesTitle')}
                  hint={t('mail.noMatchesHint')}
                  className="py-6"
                />
              ) : (
                // Flat cap, not viewport-relative: the "load more" button
                // renders below this list in the same column, so sizing the
                // list to all remaining viewport height would push it off-screen.
                // Raised from 32rem alongside the taller two-line row, so about
                // as many mails stay on screen as before.
                <ul className="max-h-[36rem] divide-y divide-line overflow-y-auto lg:max-h-[44rem]">
                  {cappedRows.map((row) => {
                    const { header, tab } = row;
                    const FolderIcon = FOLDER_ICON[tab];
                    const isRead = header.is_read || locallyReadKeys.has(row.key);
                    const isSelected = selectedKey === row.key;
                    // Not `cond && get(...) ?? fallback`: `??` passes `false`
                    // straight through, so a header with no sender rendered
                    // nothing at all instead of the fallback.
                    const sender =
                      (header.from === undefined ? undefined : names.get(header.from)) ??
                      t('mail.unknownSender');
                    // A Sent mail's sender is you, so the whole Sent folder read
                    // as a column of your own name. Its recipients are already
                    // resolved for the reading pane, so showing them here costs
                    // no extra lookup and is what makes Sent legible without
                    // spending a colour on it.
                    const party = tab === 'sent' ? recipientSummary(header) : sender;
                    return (
                      <li key={row.key}>
                        {/* Selection used to be `bg-panel-2` alone � the same fill
                              hover already paints, so the open mail was invisible
                              the moment the pointer moved. The accent edge carries
                              it now, with the fill as the second, non-colour signal;
                              both sit on the wrapper so they span the twin too. */}
                        <div
                          aria-current={isSelected ? 'true' : undefined}
                          className={cx(
                            'flex items-center',
                            interactiveClassName,
                            isSelected
                              ? selectedRowClassName
                              : 'border-l-2 border-l-transparent hover:bg-panel-2'
                          )}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              selectMailFromRow(
                                { ownerId: row.ownerId, mailId: header.mail_id },
                                e.currentTarget
                              );
                              markLocalRead(row.key);
                              // Gated on ESI's flag, not `isRead` (which also covers
                              // local state) — a failed write must get another
                              // chance on every reopen, not just the next reload.
                              if (!header.is_read) {
                                void markMailReadOnEsi(row.ownerId, header.mail_id);
                              }
                            }}
                            // `aria-current={false}` renders the string "false",
                            // which is a valid token meaning "not current" — so
                            // this is tidiness, not a bug fix: it drops an
                            // attribute from every unselected row rather than
                            // spelling out the default.
                            aria-current={isSelected ? 'true' : undefined}
                            className={cx(
                              'flex min-w-0 flex-1 items-start gap-2 self-stretch py-1.5 pr-3 pl-2.5 text-left',
                              focusRingInsetClassName
                            )}
                          >
                            {/* Unread marker, in a fixed-width gutter so read and
                                unread rows keep one left edge — the empty gutter
                                is itself the "read" signal. */}
                            <span
                              aria-hidden="true"
                              className="mt-1.5 flex w-1.5 shrink-0 justify-center"
                            >
                              {!isRead && <span className="size-1.5 rounded-full bg-accent" />}
                            </span>

                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              {/* The subject wraps rather than truncating: a
                                  clipped subject was the readability complaint,
                                  and it is the field that identifies a mail. */}
                              <span
                                className={cx(
                                  'line-clamp-2 text-sm break-words',
                                  isRead ? 'font-normal text-text-dim' : 'font-semibold text-text'
                                )}
                              >
                                {header.subject || t('mail.noSubject')}
                              </span>
                              <span className="flex items-center gap-1.5 text-xs text-text-dim">
                                {/* Glyph *and* the folder's name, not the glyph
                                    alone: DESIGN.md §5 blesses a bare decorative
                                    icon only "beside its own visible text label",
                                    and dropping the name would have made folder
                                    identity harder to see than the uppercase tag
                                    this replaced — the opposite of the point,
                                    now that several folders share one list by
                                    default. */}
                                <FolderIcon
                                  aria-hidden="true"
                                  size={Icon.ICON_SIZE.sm}
                                  className="shrink-0"
                                />
                                <span className="shrink-0 tracking-widest uppercase">
                                  {t(TAB_LABEL_KEY[tab])}
                                </span>
                                <span aria-hidden="true" className="shrink-0 text-text-faint">
                                  ·
                                </span>
                                <span className="min-w-0 truncate">{party}</span>
                                {isAll && (
                                  // Portrait alone: the name beside it repeated down the
                                  // whole list and crowded the sender. The name stays
                                  // reachable via the alt/title and the reading pane.
                                  <Tooltip content={t('mail.rowOwner', { name: row.ownerName })}>
                                    <span className="shrink-0">
                                      <CharacterAvatar
                                        characterId={row.ownerId}
                                        size="sm"
                                        loading="lazy"
                                        alt={t('mail.rowOwner', { name: row.ownerName })}
                                        className="rounded-full border-0"
                                      />
                                    </span>
                                  </Tooltip>
                                )}
                                {header.timestamp && (
                                  // `text-text-dim`, not the `text-text-faint` this
                                  // shipped with: DESIGN.md §1 restricts faint to
                                  // decoration, and a received date is content.
                                  <span className="ml-auto shrink-0 tabular-nums">
                                    {formatDateOnly(new Date(header.timestamp), timeZone)}
                                  </span>
                                )}
                              </span>
                            </span>

                            {/* The dot and the bold weight say "unread" in
                                colour and typography only — DESIGN.md §7's
                                "colour is never the sole signal" wants it in
                                words too. The folder needs no such gloss: its
                                name is rendered above. */}
                            {!isRead && <span className="sr-only">{t('mail.unread')}</span>}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {headersTruncated && (
                <p className="border-t border-line p-2 text-[0.6875rem] text-text-dim">
                  {t('mail.capNotice', { count: cappedRows.length })}
                </p>
              )}
              {hasMore && (
                <div className="border-t border-line p-2">
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => void handleLoadMore()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? t('common.loading') : t('mail.loadMore')}
                  </Button>
                </div>
              )}
            </Panel>

            <Panel
              className={isDesktop || selectedKey !== null ? '' : 'hidden'}
              // The folder the open mail sits in, not a repeat of the select
              // hint the empty body already renders — that string used to
              // appear twice on the same panel at once.
              title={selectedHeader === null ? undefined : t(TAB_LABEL_KEY[selectedTab])}
              meta={
                selectedHeader?.timestamp || (isAll && selectedRow) ? (
                  <span className="flex items-center gap-2 text-xs text-text-dim">
                    {isAll && selectedRow && (
                      <span className="inline-flex items-center gap-1">
                        <CharacterAvatar
                          characterId={selectedRow.ownerId}
                          size="sm"
                          loading="lazy"
                          className="rounded-full"
                        />
                        {t('mail.readingFor', { name: selectedRow.ownerName })}
                      </span>
                    )}
                    {selectedHeader?.timestamp && (
                      <span className="tabular-nums">
                        {formatTimestamp(new Date(selectedHeader.timestamp), timeZone)}
                      </span>
                    )}
                  </span>
                ) : undefined
              }
              actions={
                (selectedRow !== null && composeKind === null) || showBackControl ? (
                  <div className="flex items-center gap-2">
                    {selectedRow !== null && composeKind === null && (
                      <>
                        <IconButton
                          ref={replyButtonRef}
                          icon={<Icon.MailReply size={Icon.ICON_SIZE.sm} />}
                          label={t('mail.reply')}
                          size="row"
                          onClick={() => openCompose('reply', selectedRow.key)}
                        />
                        <IconButton
                          ref={forwardButtonRef}
                          icon={<Icon.MailForward size={Icon.ICON_SIZE.sm} />}
                          label={t('mail.forward')}
                          size="row"
                          onClick={() => openCompose('forward', selectedRow.key)}
                        />
                      </>
                    )}
                    {showBackControl && (
                      <Button size="sm" onClick={handleBackToList}>
                        {t('mail.backToList')}
                      </Button>
                    )}
                  </div>
                ) : undefined
              }
            >
              {selectedKey === null ? (
                <EmptyState
                  title={t('mail.selectHint')}
                  icon={<Icon.Social size={Icon.ICON_SIZE.lg} />}
                  className="py-6"
                />
              ) : body === undefined ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" label={t('common.loading')} />
                </div>
              ) : body === null ? (
                // Still gets the reader-heading focus target (issue #1485):
                // a failed/uncached body is the same "opening this mail
                // just changed the pane" transition as the success path
                // below, just with nothing to read yet.
                <div
                  ref={(el) => {
                    readerHeadingRef.current = el;
                  }}
                  tabIndex={-1}
                  className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <EmptyState title={t('mail.emptyTitle')} className="py-4" />
                </div>
              ) : (
                <div
                  ref={bodyScrollerRef}
                  className="space-y-2 overflow-y-auto text-xs"
                  style={
                    isDesktop && bodyMaxHeight !== null ? { maxHeight: bodyMaxHeight } : undefined
                  }
                >
                  <h3
                    ref={(el) => {
                      readerHeadingRef.current = el;
                    }}
                    tabIndex={-1}
                    className="text-base font-semibold break-words text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {body.data.subject || t('mail.noSubject')}
                  </h3>
                  <div className="space-y-0.5 border-b border-line pb-2 text-text-dim">
                    <p className="flex flex-wrap items-center gap-1.5">
                      {t('mail.from')}
                      {selectedHeader?.from !== undefined ? (
                        <>
                          <CharacterLink id={selectedHeader.from}>{selectedSender}</CharacterLink>
                          <StandingTag
                            standing={characterStanding(
                              selectedOwner?.standingIndex ?? NO_STANDING_INDEX,
                              selectedHeader.from,
                              senderAffiliations
                            )}
                          />
                        </>
                      ) : (
                        <span className="text-text">{selectedSender}</span>
                      )}
                    </p>
                    {selectedHeader !== null && recipients.length > 0 && (
                      <p className="flex flex-wrap items-center gap-x-1">
                        {t('mail.to')}
                        {recipients.map((recipient, index) => (
                          <span key={`${recipient.recipient_type}-${recipient.recipient_id}`}>
                            {recipient.recipient_type === 'character' ? (
                              <CharacterLink id={recipient.recipient_id}>
                                {resolveRecipientName(recipient)}
                              </CharacterLink>
                            ) : (
                              resolveRecipientName(recipient)
                            )}
                            {index < recipients.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  {/* `text-sm text-text`, not `text-xs text-text-dim`: this is
                      the one thing the pilot opened the page to read, and it
                      shipped at the smallest size in the dimmest readable
                      tier. `break-words` so an unbroken URL cannot push the
                      pane sideways. */}
                  <p className="text-sm whitespace-pre-wrap text-text break-words">{bodyText}</p>

                  {composeKind !== null && selectedRow !== null && (
                    <MailComposeBox
                      key={`${selectedRow.key}:${composeKind}`}
                      characterId={selectedRow.ownerId}
                      kind={composeKind}
                      header={selectedRow.header}
                      bodyText={bodyText}
                      senderName={selectedSender}
                      formattedTimestamp={
                        selectedRow.header.timestamp
                          ? formatTimestamp(new Date(selectedRow.header.timestamp), timeZone)
                          : ''
                      }
                      resolveRecipientName={resolveRecipientName}
                      onClose={() => setComposeKind(null)}
                      onSent={() => void handleSent(selectedRow.ownerId)}
                    />
                  )}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Mail: This character or All characters (issue #2867). The scope picker is the
 * shared `CharacterFilterControl` (#2846); the choice is remembered device-wide
 * like the folder selection, and a `scope` URL param overrides it for one view.
 * `MailView` is keyed on the scope so each one loads on its own snapshot.
 */
export function Mail() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const storedScope = useMailScope((state) => state.value);
  const setStoredScope = useMailScope((state) => state.setValue);
  const scopeHydrated = useMailScope((state) => state.hydrated);
  const hydrateScope = useMailScope((state) => state.hydrate);
  useEffect(() => {
    void hydrateScope();
  }, [hydrateScope]);
  const scopeParams = useMemo(() => ({ scope: characterFilterParam(storedScope) }), [storedScope]);
  const [scopeView, setScopeView] = useUrlParams(scopeParams);

  const characters = useLiveQuery(() => db.characters.toArray(), [], []);
  // Cached labels only, live: the menu's unread figures need no fetch of their own.
  const labelsByCharacter = useLiveQuery(
    async () => readMailLabelsForCharacters((characters ?? []).map((c) => c.characterId)),
    [characters]
  );
  const unreadByCharacter = useMemo(
    () =>
      (characters ?? []).map((c) => ({
        characterId: c.characterId,
        name: c.name,
        unread: totalSystemUnread(labelsByCharacter?.get(c.characterId)?.data.labels ?? []),
      })),
    [characters, labelsByCharacter]
  );

  // A control that cannot change anything (one Character) is not offered.
  const offered = (characters?.length ?? 0) > 1;
  const scope: CharacterFilterValue = offered ? scopeView.scope : 'current';
  function changeScope(next: CharacterFilterValue) {
    void setStoredScope(next);
    setScopeView({ scope: next });
  }

  if (!scopeHydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  return (
    <MailView
      key={scope}
      scope={scope}
      scopeControl={
        offered ? (
          <CharacterFilterControl
            activeCharacterId={activeCharacterId}
            value={scope}
            onChange={changeScope}
            characterCount={characters?.length}
            unreadByCharacter={unreadByCharacter}
            size="md"
          />
        ) : null
      }
    />
  );
}
