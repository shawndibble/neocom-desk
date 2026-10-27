/**
 * App-icon badge (Badging API). `navigator.setAppBadge(n)` puts a count on the
 * installed app's icon, and it is supported in Safari on iOS/iPadOS 16.4+ —
 * which is exactly the platform where the Overview feed is the only channel
 * and nothing can wake the app to raise a notification. It is *not* supported
 * on Chromium/Android, where the OS badges the icon off the notification
 * itself, so this is close to iOS-specific value and a no-op elsewhere.
 *
 * Takes a count rather than reading the feed itself: that keeps this module
 * free of a cycle back through `feed.ts`, which owns `refreshAppBadge` and the
 * decision about which entries are visible.
 */

interface BadgeCapableNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

/**
 * Never rejects. The badge is a nicety — a browser that refuses it (an
 * uninstalled PWA, a platform without the API) must not take down the feed
 * write that prompted the call.
 */
export async function setAppBadgeCount(count: number): Promise<void> {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as BadgeCapableNavigator;
  try {
    if (count > 0) {
      await nav.setAppBadge?.(count);
    } else {
      // clearAppBadge, not setAppBadge(0): passing 0 is specified to clear,
      // but clearing explicitly is what every implementation agrees on.
      await nav.clearAppBadge?.();
    }
  } catch {
    // See doc comment above.
  }
}
