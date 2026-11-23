/**
 * The page's one scope choice, read off the widgets and written back onto them.
 *
 * Scope is stored per widget (a widget may differ); the page's control is the bulk edit of it.
 * It shows the scope the widgets share, or Mixed. A widget whose kind cannot sum is left out of
 * the count while any widget can (it can never be on All, so it must not make every board read
 * Mixed), and a bulk All leaves it alone for the same reason.
 */
import type { Widget, WidgetScope } from './layout';

export type PageScope = WidgetScope | 'mixed';

/**
 * `read` is the scope a widget is read with (`readScope`); `sums` whether its kind can sum
 * across Characters. No widgets at all reads as All, the default a new widget opens on.
 */
export function pageScope(
  widgets: readonly Widget[],
  read: (widget: Widget) => WidgetScope,
  sums: (widget: Widget) => boolean
): PageScope {
  const summing = widgets.filter(sums);
  const counted = summing.length > 0 ? summing : widgets;
  const scopes = new Set(counted.map(read));
  if (scopes.size === 0) return 'all';
  return scopes.size === 1 ? [...scopes][0]! : 'mixed';
}
