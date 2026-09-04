/**
 * Right-click (or long-press) menu on a Notification Feed row (issue #364,
 * CONTEXT.md round 44): two items, each icon plus a label reading the row's
 * current preference state for its own Character — read from `entry.characterId`,
 * never parsed out of the rendered title/body.
 *
 * "Hide in feed" is one-way from here: it flips the row's feed channel off,
 * which removes every row of that type for that Character immediately
 * (`feedSelection.ts` filters visibility at render time) — reversible only
 * from Settings, never from this menu again, since a hidden row's own trigger
 * is no longer on screen to reopen.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui';
import { BrowserNotifyOn, BrowserNotifyOff, HideInFeed, ICON_SIZE } from '@/components/ui/icons';
import type { NotificationFeedRecord } from '@/db';
import { entryChannelTarget } from './feedSelection';
import {
  useNotificationPreferences,
  characterEventPrefs,
  characterEveTypePrefs,
  isEventEnabledFor,
  isEveTypeEnabledFor,
  toggleEventChannelPref,
  toggleEveTypeChannelPref,
} from './preferences';
import type { NotificationChannel } from './eventSelection';

export interface NotificationContextMenuProps {
  entry: NotificationFeedRecord;
  children: ReactElement;
}

export function NotificationContextMenu({ entry, children }: NotificationContextMenuProps) {
  const { t } = useTranslation();
  const prefsValue = useNotificationPreferences((state) => state.value);

  const target = entryChannelTarget(entry);

  const browserEnabled =
    target.kind === 'eveType'
      ? isEveTypeEnabledFor(
          characterEveTypePrefs(prefsValue, entry.characterId),
          target.type,
          'browser'
        )
      : isEventEnabledFor(
          characterEventPrefs(prefsValue, entry.characterId),
          target.eventId,
          'browser'
        );

  /** Effectful, unlike `isEventEnabledFor`/`isEveTypeEnabledFor` above — writes the toggle and returns its promise. */
  function applyToggle(channel: NotificationChannel) {
    return target.kind === 'eveType'
      ? toggleEveTypeChannelPref(entry.characterId, prefsValue, target.type, channel)
      : toggleEventChannelPref(entry.characterId, prefsValue, target.eventId, channel);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void applyToggle('browser')}>
          {browserEnabled ? (
            <BrowserNotifyOn size={ICON_SIZE.sm} />
          ) : (
            <BrowserNotifyOff size={ICON_SIZE.sm} />
          )}
          {browserEnabled
            ? t('notifications.contextMenu.browserOn')
            : t('notifications.contextMenu.browserOff')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void applyToggle('feed')}>
          <HideInFeed size={ICON_SIZE.sm} />
          {t('notifications.contextMenu.hideInFeed')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
