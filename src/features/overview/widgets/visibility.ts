/**
 * Which widgets the page actually draws.
 *
 * Shared by the grid and the header (whose Next deadline and "Updated" age
 * only count what is on screen), so a widget hidden on a phone contributes
 * neither a tile nor a clock.
 */
import { getKind } from './kinds';
import type { Widget } from './layout';

/**
 * Widgets this build can draw: a kind a newer build wrote is kept in the
 * stored layout (so it survives here) but is not drawn. On a phone, widgets
 * set to Hide on phone are left out too.
 */
export function visibleWidgets(widgets: readonly Widget[], isPhone: boolean): Widget[] {
  return widgets.filter(
    (widget) => getKind(widget.kind) !== undefined && (!isPhone || widget.showOnPhone)
  );
}

/** Each kind once, in first-seen order. */
export function distinctKinds(widgets: readonly Widget[]): string[] {
  return [...new Set(widgets.map((widget) => widget.kind))];
}
