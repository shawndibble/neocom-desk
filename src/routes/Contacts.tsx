import { useMemo, useState, type ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterChip,
  IconButton,
  PageHeader,
  Panel,
  ReauthBanner,
  Spinner,
  StandingIcon,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { ICON_SIZE } from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadContacts } from '@/features/character/contacts';
import { ContactContextMenu } from '@/features/character/ContactContextMenu';
import type { CachedResult } from '@/esi/cache';
import type { CharacterContact } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

interface Snapshot {
  contactsResult: CachedResult<CharacterContact[]> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  contactsNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  contactsTruncated: boolean;
  contactNames: Map<number, string>;
}

/**
 * ESI's `contact_type` verbatim was what this column printed. "Player" is what
 * a pilot calls a character contact (a "character" is also a thing corps and
 * alliances are made of), and "Corp" is how the name is written everywhere in
 * game — both shorter than what they replace, which is what lets this table
 * keep real columns on a phone.
 */
const CONTACT_TYPE_KEY: Record<CharacterContact['contact_type'], string> = {
  character: 'contacts.typeCharacter',
  corporation: 'contacts.typeCorporation',
  alliance: 'contacts.typeAlliance',
  faction: 'contacts.typeFaction',
};

type StandingCategory = 'good' | 'neutral' | 'bad';

const STANDING_CATEGORIES: readonly StandingCategory[] = ['good', 'neutral', 'bad'];

function standingCategory(standing: number): StandingCategory {
  if (standing > 0) return 'good';
  if (standing < 0) return 'bad';
  return 'neutral';
}

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();

async function loadContactsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const { cached: contactsResult, needsReauth: contactsNeedsReauth } =
    await loadContacts(characterId);
  const contactsTruncated = contactsResult?.truncated ?? false;
  // Already superseded: skip the name lookup, its result would be discarded.
  const contactIds = signal.cancelled ? [] : (contactsResult?.data ?? []).map((c) => c.contact_id);
  const contactNames = await resolveNames(contactIds);
  return { contactsResult, contactsNeedsReauth, contactsTruncated, contactNames };
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

/** Contacts: standings, blocked/watched state, filterable by standing category. */
export function Contacts() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadContactsSnapshot,
    undefined,
    { cacheKey: 'contacts' }
  );

  const [standingFilter, setStandingFilter] = useState<ReadonlySet<StandingCategory>>(
    () => new Set(STANDING_CATEGORIES)
  );

  const contactsResult = data?.contactsResult ?? null;
  const contactsNeedsReauth = data?.contactsNeedsReauth ?? false;
  const contactsTruncated = data?.contactsTruncated ?? false;
  const contactNames = data?.contactNames ?? NO_NAMES;

  const contacts = useMemo(() => contactsResult?.data ?? [], [contactsResult]);

  const countByCategory = useMemo(() => {
    const counts: Record<StandingCategory, number> = { good: 0, neutral: 0, bad: 0 };
    for (const contact of contacts) counts[standingCategory(contact.standing)] += 1;
    return counts;
  }, [contacts]);

  // Refreshing bumps useRouteSnapshot's epoch, which clears `data` (and so
  // `contactsResult`/`countByCategory`) until the new load lands — remember
  // the last successful counts so the filter chips (and the user's active
  // selection) stay on screen through a refresh instead of disappearing.
  // Switching character bumps the same epoch, so the remembered counts must
  // be dropped there too — otherwise the outgoing character's chips would
  // linger under the incoming one until its own load lands.
  const [lastGoodCounts, setLastGoodCounts] = useState<Record<StandingCategory, number> | null>(
    null
  );
  const [lastGoodCharacterId, setLastGoodCharacterId] = useState(activeCharacterId);
  if (activeCharacterId !== lastGoodCharacterId) {
    setLastGoodCharacterId(activeCharacterId);
    setLastGoodCounts(null);
  } else if (contactsResult && !contactsNeedsReauth && lastGoodCounts !== countByCategory) {
    setLastGoodCounts(countByCategory);
  }

  const filteredContacts = useMemo(
    () => contacts.filter((contact) => standingFilter.has(standingCategory(contact.standing))),
    [contacts, standingFilter]
  );

  function toggleStandingFilter(category: StandingCategory) {
    setStandingFilter((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

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

  const columns = useMemo<DataTableColumn<CharacterContact>[]>(
    () => [
      {
        id: 'name',
        header: t('contacts.name'),
        render: (contact) => contactNames.get(contact.contact_id) ?? `#${contact.contact_id}`,
        sortValue: (contact) => contactNames.get(contact.contact_id) ?? `#${contact.contact_id}`,
      },
      {
        id: 'type',
        header: t('contacts.type'),
        className: 'text-text-dim',
        render: (contact) => t(CONTACT_TYPE_KEY[contact.contact_type]),
        // Sorts on what is printed, not on ESI's word for it — otherwise
        // "Player" would sort under C and "Corp" under C too, by accident.
        sortValue: (contact) => t(CONTACT_TYPE_KEY[contact.contact_type]),
      },
      {
        id: 'standing',
        header: t('contacts.standing'),
        // The tag replaces the bar *and* the number: the value is in its
        // accessible name and its tooltip, and the column sorts on the raw
        // number below, so nothing is lost by not printing it.
        render: (contact) => <StandingIcon value={contact.standing} />,
        sortValue: (contact) => contact.standing,
      },
      {
        id: 'flags',
        header: t('contacts.flags'),
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
      },
    ],
    [t, contactNames]
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

      {lastGoodCounts && (
        <div role="group" aria-label={t('contacts.standing')} className="flex flex-wrap gap-2">
          <FilterChip
            label={t('contacts.filterGood')}
            selected={standingFilter.has('good')}
            onToggle={() => toggleStandingFilter('good')}
            count={lastGoodCounts.good}
          />
          <FilterChip
            label={t('contacts.filterNeutral')}
            selected={standingFilter.has('neutral')}
            onToggle={() => toggleStandingFilter('neutral')}
            count={lastGoodCounts.neutral}
          />
          <FilterChip
            label={t('contacts.filterBad')}
            selected={standingFilter.has('bad')}
            onToggle={() => toggleStandingFilter('bad')}
            count={lastGoodCounts.bad}
          />
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : contactsNeedsReauth ? (
        <ReauthBanner
          title={t('contacts.reauthTitle')}
          hint={t('contacts.reauthHint')}
          actionLabel={t('contacts.reauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !contactsResult || contacts.length === 0 ? (
        <EmptyState title={t('contacts.emptyTitle')} hint={t('contacts.emptyHint')} />
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
            <EmptyState title={t('contacts.noResults')} className="py-8" />
          ) : (
            <DataTable
              label={t('contacts.title')}
              columns={columns}
              rows={filteredContacts}
              rowKey={(contact) => contact.contact_id}
              defaultSort={{ columnId: 'standing', direction: 'desc' }}
              rowContextMenu={contactRowContextMenu}
              // Four columns, three of them a short word or a single icon —
              // narrow enough to stay a real table on a 390px screen rather
              // than collapsing each contact into a labelled card.
              responsive="table"
            />
          )}
        </Panel>
      )}
    </div>
  );
}
