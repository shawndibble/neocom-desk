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
import { Button, EmptyState, IconButton, Panel } from '@/components/ui';
import { Close } from '@/components/ui/icons';
import { formatAge } from '@/lib/age';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { readFeed, dismissFeedEntry, dismissFeedEntries } from './feed';
import { refreshAppBadge } from './appBadge';
import { useNotificationPreferences, isFeedChannelEnabled } from './preferences';
import { visibleFeedEntries, entriesForCharacter, otherCharacterAlerts } from './feedSelection';

export function NotificationFeedPanel() {
  const { t } = useTranslation();
  const prefsValue = useNotificationPreferences((state) => state.value);
  const hydratePrefs = useNotificationPreferences((state) => state.hydrate);
  const hydrated = useNotificationPreferences((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);

  useEffect(() => {
    void hydratePrefs();
  }, [hydratePrefs]);

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

  return (
    <Panel
      title={t('overview.notifications')}
      actions={
        <div className="flex items-center gap-1">
          {mine.length > 0 && (
            <Button size="sm" onClick={() => void dismissFeedEntries(mine.map((e) => e.id))}>
              {t('overview.notificationsDismissAll')}
            </Button>
          )}
          {/*
            A plain link rather than an icon button: the header already
            carries "Dismiss all", and a second glyph beside it would be one
            more thing to decode where a word is unambiguous.
          */}
          <Link
            to="/settings#notifications"
            className="text-[0.6875rem] tracking-widest text-text-dim uppercase underline-offset-2 hover:text-text hover:underline"
          >
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
          {mine.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 py-2 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{entry.title}</p>
                <p className="text-xs text-text-dim">{entry.body}</p>
              </div>
              <FiredAt firedAt={entry.firedAt} />
              <IconButton
                icon={<Close />}
                label={t('overview.notificationsDismiss', { title: entry.title })}
                variant="plain"
                size="sm"
                onClick={() => void dismissFeedEntry(entry.id)}
              />
            </li>
          ))}
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
