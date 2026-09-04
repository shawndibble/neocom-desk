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
  StandingBar,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
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

type StandingCategory = 'good' | 'neutral' | 'bad';

const STANDING_CATEGORIES: readonly StandingCategory[] = ['good', 'neutral', 'bad'];

function standingCategory(standing: number): StandingCategory {
  if (standing > 0) return 'good';
  if (standing < 0) return 'bad';
  return 'neutral';
}

const STANDING_TONE: Record<StandingCategory, string> = {
  good: 'text-success',
  neutral: 'text-text-dim',
  bad: 'text-danger',
};

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

/** Contacts: standings, blocked/watched state, filterable by standing category. */
export function Contacts() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadContactsSnapshot);

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
  const [lastGoodCounts, setLastGoodCounts] = useState<Record<StandingCategory, number> | null>(
    null
  );
  if (contactsResult && !contactsNeedsReauth && lastGoodCounts !== countByCategory) {
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
        render: (contact) => contact.contact_type,
        sortValue: (contact) => contact.contact_type,
      },
      {
        id: 'standing',
        header: t('contacts.standing'),
        align: 'right',
        render: (contact) => (
          <span className="inline-flex items-center justify-end gap-1.5">
            <StandingBar value={contact.standing} />
            <span
              className={`tabular-nums font-semibold ${STANDING_TONE[standingCategory(contact.standing)]}`}
            >
              {contact.standing}
            </span>
          </span>
        ),
        sortValue: (contact) => contact.standing,
      },
      {
        id: 'flags',
        header: t('contacts.flags'),
        cellClassName: (contact) =>
          contact.is_blocked ? 'text-danger' : contact.is_watched ? 'text-warning' : undefined,
        render: (contact) => {
          const flags: string[] = [];
          if (contact.is_blocked) flags.push(t('contacts.blocked'));
          if (contact.is_watched) flags.push(t('contacts.watched'));
          return flags.length > 0 ? flags.join(' · ') : '—';
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
          <>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('contacts.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
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

      {loading ? (
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
            />
          )}
        </Panel>
      )}
    </div>
  );
}
