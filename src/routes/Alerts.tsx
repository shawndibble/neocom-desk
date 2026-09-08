/**
 * Every alert this device has fired, grouped by notification type.
 *
 * Until now the feed rendered in exactly one place — inside the Overview —
 * with no page and no nav entry of its own, and `NOTIFICATION_FALLBACK_ROUTE`
 * pointed a tapped push with no route of its own at the dashboard. The
 * reworked Overview summarises alerts into a column, and a summary needs
 * somewhere to lead: this is it. The column is the count; this page is every
 * one of them.
 *
 * Device-wide, unlike the board. The poller runs across every Character on the
 * device (`foregroundPoller.ts`), so alerts belonging to an alt were previously
 * invisible until you happened to switch to it — the Overview panel could only
 * offer them as a count-per-Character footer. Here they are simply in the list,
 * each fire naming the Character it belongs to.
 *
 * Not to be merged with Settings' notification panel: that is *preferences*
 * (what may fire), this is the *record* (what did).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IconButton,
  PageHeader,
  Panel,
  SEVERITY_LABEL,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  iconButtonClassName,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { DEADLINE_SEVERITIES, type DeadlineSeverity } from '@/engine/severity';
import { AlertGroupRow } from '@/features/notifications/AlertGroupRow';
import { alertGroupLabel, groupAlertsByType } from '@/features/notifications/alertGroups';
import {
  EMPTY_ALERTS_FILTER,
  activeAlertsFilterCount,
  filterAlertGroups,
  type AlertsFilter,
  type DisplayAlertGroup,
} from '@/features/notifications/alertsFilter';
import { readFeed, dismissFeedEntries } from '@/features/notifications/feed';
import { isEntryMutedInFeed } from '@/features/notifications/feedSelection';
import {
  hydrateNotificationPreferences,
  isFeedChannelEnabled,
  setFeedMutedForCharacters,
  useNotificationPreferences,
} from '@/features/notifications/preferences';
import { refreshAppBadge } from '@/features/notifications/appBadge';

/**
 * Which severities get their own chip.
 *
 * `clear` does not: it is the bulk of any real feed (a week of filled orders),
 * and a chip selecting "almost everything" narrows nothing. Its rows are still
 * in the list — these chips are what you can filter *down* to.
 */
const FILTERABLE_SEVERITIES: readonly DeadlineSeverity[] = DEADLINE_SEVERITIES.filter(
  (severity) => severity !== 'clear'
);

/** Radix `Select` has no empty-string value, so "every character" needs a sentinel of its own. */
const ALL_CHARACTERS = 'all';

/** The next set with `value` flipped in or out — the sheet edits a draft by value, not a store. */
function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

export function Alerts() {
  const { t } = useTranslation();
  const prefsValue = useNotificationPreferences((state) => state.value);
  const prefsHydrated = useNotificationPreferences((state) => state.hydrated);
  const [filter, setFilter] = useState<AlertsFilter>(EMPTY_ALERTS_FILTER);
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    void hydrateNotificationPreferences();
  }, []);

  // Entry writes refresh the badge themselves (`feed.ts`); this covers the
  // other direction — a mute changing what counts as visible without any entry
  // being added or dismissed.
  useEffect(() => {
    void refreshAppBadge();
  }, [prefsValue]);

  const stored = useLiveQuery(() => readFeed(), [], []);
  const characters = useLiveQuery(() => db.characters.toArray(), [], []);

  const nameById = useMemo(
    () => new Map(characters.map((character) => [character.characterId, character.name])),
    [characters]
  );

  /*
   * The raw feed minus dismissals — deliberately NOT `visibleFeedEntries`,
   * which also drops muted types. A muted type has to be reachable from
   * somewhere: `NotificationContextMenu`'s "hide in feed" is one-way from a row
   * that vanishes the moment it applies, so until now the only way back was
   * Settings. Muted groups are hidden here by default and revealed by a chip.
   */
  const groups = useMemo<DisplayAlertGroup[]>(() => {
    const live = stored.filter(
      (entry) =>
        entry.dismissedAt === undefined &&
        (filter.characterId === null || entry.characterId === filter.characterId)
    );
    return groupAlertsByType(live).map((group) => ({
      ...group,
      label: alertGroupLabel(t, group.target),
      // Muted only when it is muted for every Character it fired for: a type
      // silenced on one alt is still live here for the others, and dimming the
      // whole row would misreport that.
      muted: group.entries.every((entry) => isEntryMutedInFeed(entry, prefsValue)),
    }));
  }, [stored, filter.characterId, prefsValue, t]);

  const visible = useMemo(() => filterAlertGroups(groups, filter), [groups, filter]);

  const liveGroups = useMemo(() => groups.filter((group) => !group.muted), [groups]);
  const liveEntries = useMemo(() => liveGroups.flatMap((group) => group.entries), [liveGroups]);

  const severityCounts = useMemo(() => {
    const counts = new Map<DeadlineSeverity, number>();
    for (const group of liveGroups) {
      counts.set(group.severity, (counts.get(group.severity) ?? 0) + group.count);
    }
    return counts;
  }, [liveGroups]);

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => toggled(prev, key));
  }

  // Nothing until the stored preference is known: rendering the page and then
  // pulling half of it away a tick later is worse than a beat of absence.
  if (!prefsHydrated) return null;

  const feedOff = !prefsValue.masterEnabled || !isFeedChannelEnabled(prefsValue);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('alerts.title')}
        actions={
          <>
            {/* A Link styled as an icon button: it navigates, so it stays an
                anchor, but it sits beside "Dismiss all" and reads as the same
                control. Its name lives in the tooltip and the aria-label
                alike, so the two can never drift. */}
            <Tooltip content={t('alerts.settings')}>
              <Link
                to="/settings#notifications"
                aria-label={t('alerts.settings')}
                className={iconButtonClassName()}
              >
                <Icon.Settings aria-hidden="true" />
              </Link>
            </Tooltip>
            {liveEntries.length > 0 && (
              <IconButton
                icon={<Icon.DismissAll />}
                label={t('alerts.dismissAll')}
                onClick={() => void dismissFeedEntries(liveEntries.map((entry) => entry.id))}
              />
            )}
          </>
        }
      />

      {/* The feed channel being off does not empty this page — the rows are
          still stored, and a type muted individually is still listed behind the
          chip. Saying so beats a list that looks stale for no visible reason. */}
      {feedOff && (
        <p className="rounded-xs border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          {t('alerts.feedOff')}
        </p>
      )}

      <FilterBar
        value={filter}
        onChange={setFilter}
        activeCount={activeAlertsFilterCount(filter)}
        title={t('alerts.filterTitle')}
        collapsible
        search={
          <SearchInput
            value={filter.query}
            onChange={(event) => setFilter((prev) => ({ ...prev, query: event.target.value }))}
            aria-label={t('alerts.searchLabel')}
            placeholder={t('alerts.searchPlaceholder')}
            className="w-full sm:w-64"
          />
        }
      >
        {(draft, setDraft) => (
          <>
            <FilterField label={t('alerts.characterLabel')}>
              {/* Radix `Select`, not `NativeSelect`: DESIGN.md makes the OS
                  picker the documented exception, and nothing about a character
                  list needs it. */}
              <Select
                value={draft.characterId === null ? ALL_CHARACTERS : String(draft.characterId)}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    characterId: value === ALL_CHARACTERS ? null : Number(value),
                  })
                }
              >
                <SelectTrigger aria-label={t('alerts.characterLabel')} className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CHARACTERS}>{t('alerts.allCharacters')}</SelectItem>
                  {characters.map((character) => (
                    <SelectItem key={character.characterId} value={String(character.characterId)}>
                      {character.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            {FILTERABLE_SEVERITIES.map((severity) => (
              <FilterField key={severity} label={t(SEVERITY_LABEL[severity])} stretch={false}>
                <FilterChip
                  label={t(SEVERITY_LABEL[severity])}
                  count={severityCounts.get(severity) ?? 0}
                  selected={draft.severities.has(severity)}
                  onToggle={() =>
                    setDraft({ ...draft, severities: toggled(draft.severities, severity) })
                  }
                />
              </FilterField>
            ))}
            <FilterField label={t('alerts.mutedTypes')} stretch={false}>
              <FilterChip
                label={t('alerts.mutedTypes')}
                count={groups.length - liveGroups.length}
                selected={draft.showMuted}
                onToggle={() => setDraft({ ...draft, showMuted: !draft.showMuted })}
              />
            </FilterField>
          </>
        )}
      </FilterBar>

      <Panel
        title={t('alerts.byType')}
        actions={<span className="text-[0.6875rem] text-text-dim">{t('alerts.deviceWide')}</span>}
      >
        {visible.length === 0 ? (
          <EmptyState
            title={groups.length === 0 ? t('alerts.empty') : t('alerts.noMatches')}
            hint={groups.length === 0 ? t('alerts.emptyHint') : undefined}
            className="py-6"
          />
        ) : (
          <ul className="-mx-3 divide-y divide-line">
            {visible.map((group) => (
              <AlertGroupRow
                key={group.key}
                group={group}
                expanded={expandedKeys.has(group.key)}
                onToggle={() => toggleExpanded(group.key)}
                onDismissGroup={() =>
                  void dismissFeedEntries(group.entries.map((entry) => entry.id))
                }
                onToggleMute={() =>
                  void setFeedMutedForCharacters(group.characterIds, group.target, !group.muted)
                }
                nameById={nameById}
                onDismissEntry={(id) => void dismissFeedEntries([id])}
              />
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-[0.6875rem] text-text-dim">{t('alerts.retention')}</p>
    </div>
  );
}
