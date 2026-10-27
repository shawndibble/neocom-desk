/**
 * A fresh widget id. Ids only need to be unique within one layout, but two
 * devices edit the same synced layout, so they are random rather than a
 * counter that would collide across devices.
 */
export function makeWidgetId(): string {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
