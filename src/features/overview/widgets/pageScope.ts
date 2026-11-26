import type { Widget, WidgetScope } from './layout';

export type PageScope = WidgetScope | 'mixed';

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
