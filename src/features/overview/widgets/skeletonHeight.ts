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
 *    chart or table (its header row, rows, and any pager, "+N more" line or footer), with
 *    the few kinds whose body differs every time drawn to their own shape.
 *
 * Remembered heights are a per-device convenience in `localStorage` (guarded:
 * blocked storage just means the estimate), capped so a board that is
 * rearranged for years does not grow the entry without bound.
 */
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';
import type { WidgetSize, WidgetView } from './kinds';
import type { RowsPerPage } from './tableSortPage';
import { chartHeight } from './sizes';
import { hbarRows } from './charts/sizing';
import { TABLE_ROWS } from './tableModel';

/*
 * Every figure here was measured in Chromium (1350px and 390px wide). Sub-pixel values are kept:
 * the estimate is a sum of them, rounded once.
 */
/** The headline block (`NumberBody`) without its secondary line: its padding and a `text-2xl` figure. */
const FIGURE = 50;
/** The secondary line under the figure and its gap, which the Table view's headline drops. */
const SECONDARY_LINE = 23.5;
/** A plot's axis-label line (`text-[0.6875rem]`) and the `gap-1` above it. */
const AXIS = 20.5;
/** A chart's caption line and the `gap-1.5` above it. */
const CAPTION = 22.5;
/** The chart block's bottom padding (`pb-2.5`). */
const CHART_PAD = 10;
/** The table's top border under the headline. */
const TABLE_BORDER = 1;
/** A header row of plain labels. */
const HEADER_ROW = 25;
/** A header row of sort buttons, which stand 44px tall on a phone (the touch floor). */
const SORTABLE_HEADER_DESK = 29.3;
const SORTABLE_HEADER_PHONE = 52.5;
/** A table row: `md:h-7` on a desktop, a plain row's `h-8` on a phone. */
const ROW_DESK = 28;
const ROW_PHONE = 32;
/** The "+N more" line under a table cut at the size's rows: an `sm` button and its padding. */
const MORE_DESK = 37;
const MORE_PHONE = 45;
/** A paged table's pager strip: an `sm` control row and its padding. */
const PAGER_DESK = 41;
const PAGER_PHONE = 49;
/** A table's footer line. */
const FOOTER = 29.5;
/** An HBars row (one `text-xs` line) and the gap between rows. */
const HBAR_ROW = 16;
const HBAR_GAP = 6;
/** The single stacked bar (`StackBar`): the bar, its gap and one line of legend. */
const STACK_BAR = 36;

/**
 * What a kind's body draws beyond the generic shape, where it differs every time: the generic
 * table is a header row of labels over the size's rows, and the generic chart is a plotted
 * series of the size's chart height over one axis line.
 */
interface KindShape {
  /** Table view: the header is sort buttons. */
  sortable?: boolean;
  /** Table view: a pageable table, so a list that fills the size's rows also draws the pager. */
  paged?: boolean;
  /** Table view: a footer line under the table. */
  footer?: boolean;
  /** Table view: the list is nearly always longer than the size's rows, so "+N more" draws. */
  overflows?: boolean;
  /**
   * Chart view: `hbars` (rows of bars), `stack` (one stacked bar), or `bars` (a plotted series
   * with labelled bars, an axis line and a caption).
   */
  chart?: 'hbars' | 'stack' | 'bars';
  /** Chart view: the drawing has a caption line under it. */
  caption?: boolean;
  /** HBars rows a typical pilot fills, when fewer than the size's cap. */
  hbars?: number;
}

const KIND_SHAPES: Readonly<Record<string, KindShape>> = {
  // Open orders: sortable columns, paged, and the order-slots footer once skills are read.
  orders: { sortable: true, paged: true, footer: true },
  sovRaids: { sortable: true },
  // A mailbox's newest 50 headers are always more than a widget's rows.
  mail: { overflows: true },
  // A handful of corporations' LP, with the caption.
  lp: { chart: 'hbars', hbars: 3, caption: true },
  // A device's first load has one day of snapshots: the single stacked bar and its "as of" caption.
  netWorth: { chart: 'stack', caption: true },
  profit: { chart: 'bars', caption: true },
};

function chartDrawing(shape: KindShape, size: WidgetSize, phone: boolean): number {
  const caption = shape.caption ? CAPTION : 0;
  if (shape.chart === 'hbars') {
    const rows = Math.min(shape.hbars ?? hbarRows(size), hbarRows(size));
    return rows * HBAR_ROW + (rows - 1) * HBAR_GAP + caption;
  }
  if (shape.chart === 'stack') return STACK_BAR + caption;
  if (shape.chart === 'bars') return chartHeight[size] + AXIS + caption;
  // A Small tile on a phone is too narrow for the axis labels on one line.
  const axis = phone && size === 'S' ? 2 * AXIS - 4 : AXIS;
  return chartHeight[size] + axis + caption;
}

function tableHeight(
  shape: KindShape,
  size: WidgetSize,
  phone: boolean,
  rowsPerPage: RowsPerPage | undefined
): number {
  const header = shape.sortable
    ? phone
      ? SORTABLE_HEADER_PHONE
      : SORTABLE_HEADER_DESK
    : HEADER_ROW;
  const row = phone ? ROW_PHONE : ROW_DESK;
  const pager = phone ? PAGER_PHONE : PAGER_DESK;
  let rows: number;
  let below = 0;
  if (rowsPerPage !== undefined) {
    rows = rowsPerPage;
    below += pager;
  } else {
    rows = TABLE_ROWS[size];
    // A paged table only draws its pager past the smallest page (five rows).
    if (shape.paged && rows > 5) below += pager;
    if (shape.overflows && !shape.paged) below += phone ? MORE_PHONE : MORE_DESK;
  }
  if (shape.footer) below += FOOTER;
  return TABLE_BORDER + header + rows * row + below;
}

/**
 * The body height a widget settles at with a full set of data, for its first load on a device.
 * `rowsPerPage` is the widget's chosen page size, set only once the pilot has picked one (which
 * only a paged table offers): such a table shows that many rows and a pager.
 */
export function estimatedBodyHeight(
  widget: { kind: string; view: WidgetView; size: WidgetSize; rowsPerPage?: RowsPerPage },
  phone: boolean
): number {
  const { view, size } = widget;
  const shape = KIND_SHAPES[widget.kind] ?? {};
  const headline = FIGURE + SECONDARY_LINE;
  if (view === 'number') return Math.round(headline);
  if (view === 'chart') return Math.round(headline + chartDrawing(shape, size, phone) + CHART_PAD);
  return Math.round(FIGURE + tableHeight(shape, size, phone, widget.rowsPerPage));
}

const STORAGE_KEY = 'overview.widgetHeights';
const MAX_ENTRIES = 100;
/** Writes are trailing-debounced, so a window drag does not rewrite the whole map every frame. */
export const WRITE_DELAY_MS = 250;

let cache: Map<string, number> | null = null;
let pendingWrite: ReturnType<typeof setTimeout> | null = null;

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
  widget: { id: string; view: WidgetView; size: WidgetSize; rowsPerPage?: RowsPerPage },
  characterId: number | null,
  phone: boolean
): string {
  // A paged table's page size changes its height; it only matters to the Table view.
  const page = widget.view === 'table' ? `:${widget.rowsPerPage ?? '-'}` : '';
  return `${characterId ?? 0}:${widget.id}:${widget.view}:${widget.size}${page}:${phone ? 'p' : 'd'}`;
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
  if (pendingWrite !== null) clearTimeout(pendingWrite);
  pendingWrite = setTimeout(flush, WRITE_DELAY_MS);
}

function flush(): void {
  pendingWrite = null;
  if (cache) writeLocal(STORAGE_KEY, JSON.stringify(Object.fromEntries(cache)));
}

/** Drops the in-memory copy (and any write not yet made) so the next read goes back to storage. For tests. */
export function resetRememberedHeights(): void {
  if (pendingWrite !== null) clearTimeout(pendingWrite);
  pendingWrite = null;
  cache = null;
}
