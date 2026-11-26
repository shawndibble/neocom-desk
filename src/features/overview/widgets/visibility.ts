import { getKind, type WidgetKindDef } from './kinds';
import type { Widget } from './layout';

export function visibleWidgets(
  widgets: readonly Widget[],
  isPhone: boolean,
  canDraw: (kind: WidgetKindDef) => boolean = () => true
): Widget[] {
  return widgets.filter((widget) => {
    const kind = getKind(widget.kind);
    return kind !== undefined && canDraw(kind) && (!isPhone || widget.showOnPhone);
  });
}

export function distinctKinds(widgets: readonly Widget[]): string[] {
  return [...new Set(widgets.map((widget) => widget.kind))];
}
