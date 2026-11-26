interface BadgeCapableNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export async function setAppBadgeCount(count: number): Promise<void> {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as BadgeCapableNavigator;
  try {
    if (count > 0) {
      await nav.setAppBadge?.(count);
    } else {
      await nav.clearAppBadge?.();
    }
  } catch {}
}
