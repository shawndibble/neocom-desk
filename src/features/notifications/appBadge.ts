import { ignoreIdbTeardown } from '@/db/teardown';
import { setAppBadgeCount } from './badge';
import { readFeed } from './feed';
import { visibleFeedEntries } from './feedSelection';
import {
  useNotificationPreferences,
  hydrateNotificationPreferences,
  isFeedChannelEnabled,
} from './preferencesStore';

export async function refreshAppBadge(): Promise<void> {
  await ignoreIdbTeardown(deriveAppBadge());
}

async function deriveAppBadge(): Promise<void> {
  await hydrateNotificationPreferences();
  const prefs = useNotificationPreferences.getState().value;
  if (!prefs.masterEnabled || !isFeedChannelEnabled(prefs)) {
    await setAppBadgeCount(0);
    return;
  }
  await setAppBadgeCount(visibleFeedEntries(await readFeed(), prefs).length);
}
