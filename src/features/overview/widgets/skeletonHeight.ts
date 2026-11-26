import { readLocal, writeLocal } from '@/lib/safeLocalStorage';
import type { DefinedKindId, WidgetSize, WidgetView } from './kinds';
import { DEFAULT_ROWS_PER_PAGE, type RowsPerPage } from './tableSortPage';
import { chartHeight } from './sizes';
import { hbarRows } from './charts/sizing';
import { TABLE_ROWS } from './tableModel';

const FIGURE = 50;
const SECONDARY_LINE = 23.5;
const AXIS = 20.5;
const AXIS_WRAP = AXIS - 4;
const CAPTION = 22.5;
const CHART_PAD = 10;
const TABLE_BORDER = 1;
const HEADER_ROW = 25;
const SORTABLE_HEADER_DESK = 29.3;
const SORTABLE_HEADER_PHONE = 44.5;
const ROW_DESK = 28;
const ROW_PHONE = 32;
const ROW_PHONE_LINKED = 36;
const MORE_DESK = 37;
const MORE_PHONE = 45;
const PAGER_DESK = 41;
const PAGER_PHONE = 49;
const FOOTER = 29.5;
const HBAR_ROW = 16;
const HBAR_GAP = 6;
const STACK_BAR = 36;

interface KindShape {
  sortable?: boolean;
  paged?: boolean;
  linkedRows?: boolean;
  footer?: boolean;
  overflows?: boolean;
  chart?: 'hbars' | 'stack' | 'bars';
  caption?: boolean;
  hbars?: number;
}

const KIND_SHAPES = {
  orders: { sortable: true, paged: true, footer: true },
  sovRaids: { sortable: true, linkedRows: true },
  incursions: { linkedRows: true },
  stock: { linkedRows: true },
  mercenaryDens: { linkedRows: true },
  corpSovereignty: { linkedRows: true },
  corpWallet: { linkedRows: true },
  corpAssets: { linkedRows: true },
  corpSrp: { linkedRows: true },
  mail: { overflows: true },
  lp: { chart: 'hbars', hbars: 3, caption: true },
  netWorth: { chart: 'stack', caption: true },
  profit: { chart: 'bars', caption: true },
} satisfies Partial<Record<DefinedKindId, KindShape>>;

const shapeOf = (kind: string): KindShape =>
  (KIND_SHAPES as Readonly<Record<string, KindShape>>)[kind] ?? {};

function chartDrawing(shape: KindShape, size: WidgetSize, phone: boolean): number {
  const caption = shape.caption ? CAPTION : 0;
  if (shape.chart === 'hbars') {
    const rows = Math.min(shape.hbars ?? hbarRows(size), hbarRows(size));
    return rows * HBAR_ROW + (rows - 1) * HBAR_GAP + caption;
  }
  if (shape.chart === 'stack') return STACK_BAR + caption;
  if (shape.chart === 'bars') return chartHeight[size] + AXIS + caption;
  const axis = phone && size === 'S' ? AXIS + AXIS_WRAP : AXIS;
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
  const row = phone ? (shape.linkedRows ? ROW_PHONE_LINKED : ROW_PHONE) : ROW_DESK;
  const pager = phone ? PAGER_PHONE : PAGER_DESK;
  let rows: number;
  let below = 0;
  if (shape.paged || rowsPerPage !== undefined) {
    rows = rowsPerPage ?? DEFAULT_ROWS_PER_PAGE;
    below += pager;
  } else {
    rows = TABLE_ROWS[size];
    if (shape.overflows) below += phone ? MORE_PHONE : MORE_DESK;
  }
  if (shape.footer) below += FOOTER;
  return TABLE_BORDER + header + rows * row + below;
}

export function estimatedBodyHeight(
  widget: { kind: string; view: WidgetView; size: WidgetSize; rowsPerPage?: RowsPerPage },
  phone: boolean
): number {
  const { view, size } = widget;
  const shape = shapeOf(widget.kind);
  const headline = FIGURE + SECONDARY_LINE;
  if (view === 'number') return Math.round(headline);
  if (view === 'chart') return Math.round(headline + chartDrawing(shape, size, phone) + CHART_PAD);
  return Math.round(FIGURE + tableHeight(shape, size, phone, widget.rowsPerPage));
}

const STORAGE_KEY = 'overview.widgetHeights';
const MAX_ENTRIES = 100;
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
    } catch {}
  }
  return cache;
}

export function heightKey(
  widget: { id: string; view: WidgetView; size: WidgetSize; rowsPerPage?: RowsPerPage },
  characterId: number | null,
  phone: boolean
): string {
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

export function resetRememberedHeights(): void {
  if (pendingWrite !== null) clearTimeout(pendingWrite);
  pendingWrite = null;
  cache = null;
}
