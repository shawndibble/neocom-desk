/**
 * The Overview's Notification Feed (CONTEXT.md round 20): what the Foreground
 * Poller fired for the active Character, newest first, dismissible one at a
 * time or all at once.
 *
 * This is the delivery channel that works on every platform. A browser
 * notification needs a permission grant and an OS that will raise one, which
 * rules out iOS entirely while the app is closed (ADR 0007) — so for a good
 * share of installs this panel is not a convenience, it is the only place a
 * fired notification is ever seen. It therefore renders whenever the feed
 * channel is on, independent of `Notification.permission`.
 *
 * Scoped to the active Character, like the rest of the Overview. The poller
 * still runs across every Character on the device, so the alerts belonging to
 * the others would otherwise be invisible until you happened to switch: the
 * footer row surfaces them as a count per Character and switches on tap,
 * rather than mixing another Character's rows into this one's dashboard.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { Button, EmptyState, IconButton, Panel, buttonClassName } from '@/components/ui';
import { Close } from '@/components/ui/icons';
import { formatAge } from '@/lib/age';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { readFeed, dismissFeedEntries } from './feed';
import { refreshAppBadge } from './appBadge';
import { NotificationContextMenu } from './NotificationContextMenu';
import { notificationUrlFor } from './notificationOptions';
import {
  useNotificationPreferences,
  hydrateNotificationPreferences,
  isFeedChannelEnabled,
} from './preferences';
import { visibleFeedEntries, entriesForCharacter, otherCharacterAlerts } from './feedSelection';
import { groupIdenticalFires } from './groupFires';

export function NotificationFeedPanel() {
  const { t } = useTranslation();
  const prefsValue = useNotificationPreferences((state) => state.value);
  const hydrated = useNotificationPreferences((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);

  useEffect(() => {
    void hydrateNotificationPreferences();
  }, []);

  // Entry writes refresh the badge themselves (`feed.ts`); this covers the
  // other direction — a channel or event toggle changing what counts as
  // visible without any entry being added or dismissed.
  useEffect(() => {
    void refreshAppBadge();
  }, [prefsValue]);

  const stored = useLiveQuery(() => readFeed(), [], []);
  const characters = useLiveQuery(() => db.characters.toArray(), [], []);

  // Nothing until the stored preference is known: rendering the panel and
  // then pulling it away a tick later is worse than a beat of absence.
  if (!hydrated) return null;
  if (!prefsValue.masterEnabled || !isFeedChannelEnabled(prefsValue)) return null;

  // Filtered live rather than at write time, so a toggle flipped in Settings
  // takes effect on this page immediately — see `feedSelection.ts`.
  const visible = visibleFeedEntries(stored, prefsValue);
  const mine = entriesForCharacter(visible, activeCharacterId);
  const others = otherCharacterAlerts(
    visible,
    activeCharacterId,
    new Map(characters.map((c) => [c.characterId, c.name]))
  );

  /*
   * Rows that read identically are collapsed into one carrying a count, the
   * same way a burst of them is collapsed into a single browser toast — same
   * function, same key (eventId + title + body), so the two channels can never
   * disagree about what counts as a duplicate.
   *
   * Collapsed here at render, never at write: the feed stores one row per
   * occurrence on purpose (`foregroundPoller.ts`), because an Occurrence Key
   * is what lets the Scheduled Push backend and this device agree on which row
   * an occurrence belongs to. Merging at write would lose the others for good;
   * merging here is only a way of showing them, and a dismissal still reaches
   * every row behind the one on screen.
   *
   * Grouping is global rather than run-length: ten filled orders interrupted
   * by one wallet change are still ten of the same thing, and leaving the
   * eleventh stranded below would be exactly the clutter this removes. A group
   * sits where its newest member sat, so the list stays newest-first.
   */
  const groups = groupIdenticalFires(
    mine.map((entry) => ({ fire: entry, title: entry.title, body: entry.body }))
  );

  return (
    <Panel
      title={t('overview.notifications')}
      actions={
        <div className="flex items-center gap-2">
          {mine.length > 0 && (
            <Button size="sm" onClick={() => void dismissFeedEntries(mine.map((e) => e.id))}>
              {t('overview.notificationsDismissAll')}
            </Button>
          )}
          {/*
            A Link styled via `buttonClassName` rather than `Button`: it
            navigates, so it stays an anchor, but it sits beside "Dismiss
            all" and should read as the same kind of control.
          */}
          <Link to="/settings#notifications" className={buttonClassName({ size: 'sm' })}>
            {t('overview.notificationsSettings')}
          </Link>
        </div>
      }
    >
      {mine.length === 0 ? (
        <EmptyState
          title={t('overview.notificationsEmpty')}
          hint={t('overview.notificationsEmptyHint')}
          className="py-4"
        />
      ) : (
        <ul className="divide-y divide-line">
          {groups.map((group) => {
            const entry = group.fire;
            // The count belongs in the title, not beside it: the dismiss
            // control and the context menu both name the row by its title, and
            // a count kept out of that name would have them offering to
            // dismiss "Market order filled" while ten of them sit there.
            const title =
              group.count > 1
                ? t('notifications.groupedTitle', { title: entry.title, count: group.count })
                : entry.title;
            return (
              <NotificationContextMenu key={entry.id} entry={entry}>
                <li className="flex items-start gap-3 py-2 first:pt-0">
                  {/*
                    The same route a browser notification's own click lands on
                    (`notificationOptions.ts`'s `NOTIFICATION_ROUTES`) — the feed
                    is this app's other delivery channel for the same fires, so a
                    tap here should go to the same place a tap on the OS bubble
                    would (issue: notification click-through).
                  */}
                  <Link
                    to={notificationUrlFor(entry.eventId)}
                    className="min-w-0 flex-1 rounded-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <p className="text-sm font-medium hover:underline">{title}</p>
                    <p className="text-xs text-text-dim">{entry.body}</p>
                  </Link>
                  {/* The newest member's age: `readFeed` hands the rows over
                      newest-first, and the grouper keeps the first one it saw
                      as the representative. */}
                  <FiredAt firedAt={entry.firedAt} />
                  <IconButton
                    icon={<Close />}
                    label={t('overview.notificationsDismiss', { title })}
                    variant="plain"
                    size="sm"
                    onClick={() => void dismissFeedEntries(group.fires.map((e) => e.id))}
                  />
                </li>
              </NotificationContextMenu>
            );
          })}
        </ul>
      )}

      {others.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-[0.6875rem] tracking-widest text-text-dim uppercase">
            {t('overview.notificationsOtherCharacters')}
          </p>
          <div className="flex flex-wrap gap-2">
            {others.map((other) => (
              <Button
                key={other.characterId}
                size="sm"
                onClick={() => void setActiveCharacter(other.characterId)}
              >
                <span className="truncate">{other.name}</span>
                <span className="ml-2 rounded-xs bg-panel-2 px-1.5 tabular-nums">
                  {other.count}
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * Same age ladder as `DataAgeBadge` (`lib/age.ts`) without its staleness
 * tone: an old notification is old, not stale — nothing about it needs
 * refreshing, so colouring it like out-of-date data would misreport it.
 */
function FiredAt({ firedAt }: { firedAt: number }) {
  const { t } = useTranslation();
  const date = new Date(firedAt);
  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString()}
      className="shrink-0 pt-0.5 text-[0.6875rem] tabular-nums text-text-dim"
    >
      {/* eslint-disable-next-line react-hooks/purity -- relative age reads the wall clock; it only affects this label */}
      {formatAge(Math.max(0, Date.now() - firedAt), t)}
    </time>
  );
}
