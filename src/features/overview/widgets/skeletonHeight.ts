/**
 * How tall a widget's loading skeleton stands, so the board does not jump when
 * the data lands (Cumulative Layout Shift).
 *
 * A widget's body is as tall as its content, and the content arrives after the
 * first paint: a skeleton of one headline's height under a widget that settles
 * at eight table rows pushes every widget below it down. So the skeleton
 * reserves, in order of preference:
 *
 * 1. the height this widget's body settled at last time on this device (same
 *    Character, view, size and phone layout), which is exact for the common
 *    case of reopening the board;
 * 2. otherwise an estimate from the view and size: a headline, plus the size's
 *    chart or table rows.
 *
 * Remembered heights are a per-device convenience in `localStorage` (guarded:
 * blocked storage just means the estimate), capped so a board that is
 * rearranged for years does not grow the entry without bound.
 */
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';
import type { WidgetSize, WidgetView } from './kinds';
import { chartHeight } from './sizes';
import { TABLE_ROWS } from './tableModel';

/** The headline block (`NumberBody`): its padding, a `text-2xl` figure and one secondary line. */
const HEADLINE = 72;
/** A table row: `md:h-7` on a desktop; on a phone a linked row is `h-11` and a plain one `h-8`. */
const ROW_DESK = 28;
const ROW_PHONE = 40;
/** The chart's own bottom padding and gap. */
const CHART_PAD = 16;

export function estimatedBodyHeight(view: WidgetView, size: WidgetSize, phone: boolean): number {
  if (view === 'number') return HEADLINE;
  if (view === 'chart') return HEADLINE + chartHeight[size] + CHART_PAD;
  // The Table view's headline drops its secondary line, the table takes the rest.
  return HEADLINE - 22 + TABLE_ROWS[size] * (phone ? ROW_PHONE : ROW_DESK);
}

const STORAGE_KEY = 'overview.widgetHeights';
const MAX_ENTRIES = 100;

let cache: Map<string, number> | null = null;

function load(): Map<string, number> {
  if (cache) return cache;
  cache = new Map();
  const raw = readLocal(STORAGE_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'number' && value > 0) cache.set(key, value);
        }
      }
    } catch {
      // Junk in storage: start over.
    }
  }
  return cache;
}

export function heightKey(
  widget: { id: string; view: WidgetView; size: WidgetSize },
  characterId: number | null,
  phone: boolean
): string {
  return `${characterId ?? 0}:${widget.id}:${widget.view}:${widget.size}:${phone ? 'p' : 'd'}`;
}

export function rememberedBodyHeight(key: string): number | undefined {
  return load().get(key);
}

export function rememberBodyHeight(key: string, px: number): void {
  const height = Math.round(px);
  if (height <= 0) return;
  const map = load();
  if (map.get(key) === height) return;
  // Re-inserted so insertion order is recency order, and the oldest go first.
  map.delete(key);
  map.set(key, height);
  while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value!);
  writeLocal(STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
}

/** Drops the in-memory copy so the next read goes back to storage. For tests. */
export function resetRememberedHeights(): void {
  cache = null;
}
