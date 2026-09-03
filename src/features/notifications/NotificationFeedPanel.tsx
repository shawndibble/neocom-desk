/**
 * The Overview's Notification Feed (CONTEXT.md round 20): what the Foreground
 * Poller fired, newest first, dismissible one at a time or all at once.
 *
 * This is the delivery channel that works on every platform. A browser
 * notification needs a permission grant and an OS that will raise one, which
 * rules out iOS entirely while the app is closed (ADR 0007) — so for a good
 * share of installs this panel is not a convenience, it is the only place a
 * fired notification is ever seen. It therefore renders whenever the feed
 * channel is on, independent of `Notification.permission`.
 *
 * Deliberately **not** scoped to the active Character. The poller runs across
 * every Character on the device, so a per-Character feed would hide an alt's
 * events behind a Character switch — exactly the "I never got told" the feed
 * exists to fix. Every rendered body already names its Character
 * (`notificationText`, foregroundPoller.ts), so the rows stay unambiguous.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, EmptyState, IconButton, Panel } from '@/components/ui';
import { Close } from '@/components/ui/icons';
import { formatAge } from '@/lib/age';
import { readFeed, dismissFeedEntry, dismissAllFeedEntries } from './feed';
import { useNotificationPreferences, isFeedChannelEnabled } from './preferences';

export function NotificationFeedPanel() {
  const { t } = useTranslation();
  const prefsValue = useNotificationPreferences((state) => state.value);
  const hydratePrefs = useNotificationPreferences((state) => state.hydrate);
  const hydrated = useNotificationPreferences((state) => state.hydrated);

  useEffect(() => {
    void hydratePrefs();
  }, [hydratePrefs]);

  const entries = useLiveQuery(() => readFeed(), [], []);

  // Nothing until the stored preference is known: rendering the panel and
  // then pulling it away a tick later is worse than a beat of absence.
  if (!hydrated) return null;
  if (!prefsValue.masterEnabled || !isFeedChannelEnabled(prefsValue)) return null;

  return (
    <Panel
      title={t('overview.notifications')}
      actions={
        entries.length > 0 ? (
          <Button size="sm" onClick={() => void dismissAllFeedEntries()}>
            {t('overview.notificationsDismissAll')}
          </Button>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          title={t('overview.notificationsEmpty')}
          hint={t('overview.notificationsEmptyHint')}
          className="py-4"
        />
      ) : (
        <ul className="divide-y divide-line">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
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
