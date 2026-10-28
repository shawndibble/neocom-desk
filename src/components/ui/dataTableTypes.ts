import type { ReactElement, ReactNode, Ref } from 'react';
import type { DataTableExportHandle, TableExportConfig } from './useTableExport';

export interface DataTableSort {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface DataTableColumn<T> {
  id: string;
  /** Already-translated header text. */
  header: string;
  align?: 'left' | 'right' | 'center';
  /** Static cell classes — `whitespace-nowrap`, `tabular-nums`, `text-text-dim`. */
  className?: string;
  /** Row-dependent cell classes, for per-value tones (`iskToneClass`, status tones). */
  cellClassName?: (row: T) => string | undefined;
  /**
   * Static header classes — for a short multi-word header (e.g. "ISK / LP")
   * that should stay on one line rather than wrap when its column is
   * squeezed. Separate from `className` (cell-only) since a cell tone like
   * `text-text-dim` has no business on the header.
   */
  headerClassName?: string;
  /**
   * Classes for the `<th>` element itself, sortable column or not —
   * `headerClassName` moves onto a sortable column's button, where a width
   * does not size the column. For a `table-fixed` table whose column widths
   * have to match another table's (Materials' per-section tables).
   */
  headerCellClassName?: string;
  /**
   * Fixed column width, a CSS length — use `ch` (`'18ch'`) so it follows the
   * font; the `COL_*` constants in `dataTableWidths.ts` cover the common
   * kinds. A windowed table (`virtualize`) that sets a width on any column
   * switches to `table-layout: fixed`: columns without one share what is left
   * and their text truncates (`truncate` on the cell), so scrolling cannot
   * resize columns as rows mount and unmount (`minWidth` sets their floor). Ignored while the table is not
   * windowed and in the stacked card layout.
   */
  width?: string;
  /**
   * Least a width-less column of a fixed-layout (windowed) table squeezes to,
   * a CSS length; default `16ch`. A `min-w-*` class on the cell does nothing
   * there, so the table's own `min-width` is where the floor lives. Ignored
   * like `width` is: while not windowed, and in the stacked card layout.
   */
  minWidth?: string;
  /**
   * Pins the column at the left edge while the rest scroll sideways under it
   * (a table that overflows its wrapper, e.g. `responsive="table"` on a
   * phone), so row labels stay on screen. Below `md` it also gets a right
   * border marking the scroll edge and shrinks to ~120px; where the table
   * fits, it's a visual no-op. Only for the first column.
   */
  stickyStart?: boolean;
  /**
   * With `stickyStart`: paint the pinned cell on the panel surface instead of
   * the page background, for a table inside a `Panel` body. Default unchanged.
   */
  stickyStartOnPanel?: boolean;
  /**
   * One-line plain-language note on what the column's values *are*, shown as
   * a small info control beside the header text — e.g. that a ledger date is
   * an EVE/UTC calendar day, not a local one. Only for a genuine ambiguity a
   * reader could get wrong; most columns explain themselves.
   */
  headerTooltip?: string;
  /**
   * Drops the column below `sm` (CSS `max-sm:hidden` on its header and cells)
   * when the table renders as a table: `responsive="table"`, or `stacked`
   * false. A read-only display table that is a few columns too wide for a
   * phone sheds its low-value columns this way instead of stacking into
   * cards. Ignored in the stacked card layout, where every cell is a labelled
   * row. The column still sorts and exports.
   *
   * Only for a table with no Columns menu: a pilot can't tick back a column
   * that has no control to point at. A table with a Columns menu does not set
   * this; it lists the columns that start unticked on a phone in
   * `useColumnVisibility`'s `phoneOffByDefault`, so the menu stays truthful.
   */
  phoneHidden?: boolean;
  render: (row: T) => ReactNode;
  /**
   * Declares the column sortable and extracts its comparable value.
   * `undefined` sinks the row to the end, in either direction, rather than
   * being treated as zero.
   */
  sortValue?: (row: T) => string | number | undefined;
  /**
   * Direction a first click on this column sorts. Default: inferred from the
   * sort value — numbers and dates `desc` (biggest, newest first), text `asc`.
   * Set `'asc'` for a number whose best row is the lowest: jumps and
   * distance, rank and position, a price in a cheapest-first list.
   */
  sortFirst?: 'asc' | 'desc';
  /**
   * Names the row in the stacked (below-`sm`) layout: this cell becomes the
   * card's title — hoisted to the top, unlabelled, semibold — while the rest
   * stay label/value pairs. Defaults to the first column, which is usually
   * right. Set it where reading order and identity disagree: a wallet journal
   * leads with the date because a ledger should, but a card titled
   * "9/1/2026, 9:34:21 PM" says nothing, so its `refType` claims this instead.
   * At most one column per table; later ones are ignored.
   */
  primary?: boolean;
  /**
   * Pins this cell to the stacked card's top-right corner instead of its own
   * labelled row — for a purely decorative, non-tabular cell (an affordance
   * icon) that reads as a stray unlabelled line when stacked normally. At
   * most one column per table; later ones are ignored.
   *
   * `'start'` pins it to the top-*left* corner instead — for a row-selection
   * checkbox, which reads as the card's own leading control rather than a
   * value about it. Only meaningful in the labelled stack (`stackLayout`
   * `"labelled"`, the default): the dense stack always renders the corner in
   * flow, right of the title, regardless of this value.
   *
   * In the dense stack (`stackLayout="dense"`) the corner is not decorative
   * but the card's headline figure: it sits *in flow* on the title line,
   * right of the primary cell, bold and unwrapped — a courier offer's
   * ISK/jump, the number a reader scans the list by.
   */
  cardCorner?: boolean | 'start';
  /**
   * Pins this cell to the stacked card's top-right corner, same spot as
   * `cardCorner` — but for a real control (a "More actions" button built
   * from a custom render rather than the table's own `rowMoreActions` column,
   * because the row needs per-row props `rowMoreActions` can't take), not a
   * decorative one. Reuses `rowMoreActions`'s own `dt-actions` CSS rather
   * than `cardCorner`'s `dt-corner` — the button keeps its 36px touch-tier target
   * and the title-collision padding that CSS carries, which `dt-corner`
   * doesn't. Exactly one of `cardCorner`/`cardActions` per table; at most one
   * `cardActions` column, later ones ignored.
   */
  cardActions?: boolean;
  /**
   * Dense stack only: text printed around this cell's value on the card's
   * meta line, e.g. `{ before: 'Qty ' }` or `{ after: ' reward' }`. The dense
   * card drops column headers, so a bare "12" or "4.2M" needs a word to say
   * what it is. Already translated, like `header`. Emitted as
   * `data-stack-before`/`data-stack-after` and printed by CSS, so the cell's
   * own content — and the table at `sm` and up — is untouched.
   */
  stackAffix?: { before?: string; after?: string };
  /**
   * Dense stack only: pins a control cell to the card's left (`'start'`) or
   * right (`'end'`) edge instead of printing it as one more `·` value on the
   * 11px meta line, where a control is neither tappable nor readable. A
   * `start` cell (a row-selection checkbox) is centred across both lines; an
   * `end` cell (Hauling's Bring box) closes the second line at its right end,
   * leaving the title line its full width. A `below` cell takes a third line
   * of its own under the meta line, for a value and its control that would
   * crowd line two (Thera's signature pair and Copy button). At most one
   * column per edge; elsewhere (the labelled stack, the table) it is an
   * ordinary cell.
   */
  stackEdge?: 'start' | 'end' | 'below';
}

/**
 * Per-row disclosure (Market's order-book row expand): clicking a row opens
 * one full-width detail row beneath it, rendered by the caller. At most one
 * row open at a time — a second click opens the next row and closes the
 * first, an accordion rather than independent toggles, so a long book never
 * grows several detail blocks at once. State lives here, not with the
 * caller: `renderDetail` only ever needs the row it was given.
 */
export interface DataTableExpandableRow<T> {
  /** Content of the full-width row shown beneath an expanded row. */
  renderDetail: (row: T) => ReactNode;
  /**
   * Hides the chevron that otherwise marks a row as expandable — the row
   * still opens on click, this only drops the visual affordance for a table
   * whose caller has another cue for it (Hauling: the whole row reads as a
   * disclosure already).
   */
  hideIcon?: boolean;
  /**
   * Draws the §6c expand-in-place cue instead: a leading rotating caret in
   * the first cell, hidden in the stacked card layout (the card is the tap
   * target). Implies `hideIcon`'s trailing chevron being dropped, so a row
   * with a ⋮ keeps one trailing control.
   */
  leadingIcon?: boolean;
  /** Row open on first render; lets a page restore it after navigating away. */
  initialKey?: string | number | null;
  /** Told the open row's key (null when none) whenever it changes. */
  onExpandedChange?: (key: string | number | null) => void;
}

/**
 * Row grouping (`DataTable`'s `groupBy`): rows sharing a key fold behind one
 * toggle row, so a list with many near-duplicates (ten courier offers on one
 * route) reads as one line per distinct thing. Phone-only unless `allWidths`.
 */
export interface DataTableGroupBy<T> {
  /** Rows with equal non-null keys group; null never groups. */
  key: (row: T) => string | null;
  /** Content of the group's toggle button, given the group's rows in current sort order. */
  renderHeader: (rows: readonly T[]) => ReactNode;
  /** Initial expansion per group; default collapsed. */
  defaultExpanded?: (rows: readonly T[]) => boolean;
  /**
   * Groups at every width, not only on a phone — for a fold that is part of
   * what the table says rather than a space saving (Route Safety's quiet
   * stretches of a route).
   */
  allWidths?: boolean;
  /**
   * Fewest rows a key needs before it folds; default 2, since one courier
   * offer behind a toggle saves nothing. 1 for a fold that names a section
   * rather than collapsing duplicates (the Mining Tax history's months),
   * where a month with one entry still reads as that month.
   */
  minSize?: number;
}

export interface DataTableProps<T> {
  /** @summary Column definitions: header text, cell renderer and optional sort value. */
  columns: readonly DataTableColumn<T>[];
  /** @summary The data to show; one entry per table row. */
  rows: readonly T[];
  /**
   * @summary Stable unique key per row.
   *
   * Must be unique across `rows` — React reconciles on it, and duplicates
   * leave rows from a previous render stranded in the table. `index` is
   * there for rows that carry no identity of their own: a public contract
   * lists the same blueprint once per copy, so 70% of BPC Search's rows
   * collided on every field it has.
   */
  rowKey: (row: T, index: number) => string | number;
  /**
   * Row-level classes. Not for dimming a row's own text below AA (issue
   * #1491) — a stale/lapsed row keeps full-contrast text and carries a
   * non-color cue instead (Contracts' status icon + tooltip).
   */
  rowClassName?: (row: T) => string | undefined;
  /**
   * The row a notification pointed at (`lib/useHighlightParam`): scrolled into
   * view once and pulsed, so the reader arrives on it rather than scanning for
   * it.
   *
   * Handled here rather than by each panel because this component already owns
   * `rowKey` and the DOM the row lives in — every caller would otherwise repeat
   * the same ref, `querySelector` and reduced-motion check. A key matching no
   * row does nothing, which is the ordinary case for a link that outlived the
   * data it pointed at.
   */
  highlightRowKey?: string | number | null;
  /**
   * Marks one row as the persistent current selection — e.g. the offer the
   * LP Store's detail panel is showing. `aria-current="true"` on that row's
   * `<tr>`, so the selection reads in text/AT, and the row wears
   * `selectedRowClassName` (accent left border, `panel-2` fill, accent
   * primary cell) itself — a caller no longer tints it (DESIGN.md §6c, §7). Distinct from
   * `highlightRowKey`'s one-shot `"location"`: that one is a deep link the
   * reader arrives on and moves past, this one persists as long as the row
   * stays selected.
   *
   * Not meant to name the same row as `highlightRowKey` at once: the latter
   * writes `aria-current` imperatively (`useScrollToRowKey`), which would
   * fight this prop's declarative value on that row. No current caller
   * passes both for the same key.
   */
  selectedRowKey?: string | number | null;
  /** @summary Accessible name for the table. */
  label: string;
  className?: string;
  /** Column and direction to sort by before any header click. Column must declare `sortValue`. */
  defaultSort?: DataTableSort;
  /**
   * Controlled sort, for a table whose sort lives somewhere else — typically
   * the URL (`lib/useUrlState`'s `useUrlSort`). Passing it (even `null`)
   * makes `defaultSort` inert; every header click and phone-picker change
   * goes to `onSortChange` instead of internal state. Omitted, the table
   * keeps its own sort as it always has.
   */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
  /** `'compact'` tightens header and cell padding on both axes. Table-level, not per-column — a table is compact as a whole. */
  density?: 'default' | 'compact';
  /**
   * Wraps a row's `<tr>` — e.g. a right-click menu. When set, the `<tr>`
   * gets `tabIndex={0}` so a keyboard user can focus it and open the menu
   * with Shift+F10 / the Menu key, the same way `ContextMenu.test.tsx`
   * drives a focused trigger.
   */
  rowContextMenu?: (row: T, tr: ReactElement) => ReactElement;
  /**
   * Appends a trailing cell holding a visible "More actions" button that
   * opens the same items as `rowContextMenu` (WCAG 2.1.1) — the row itself
   * is only reachable by Shift+F10 on a focused row, which few keyboard
   * users know. Needs a `rowContextMenu` whose wrapper publishes its items
   * (`RowActionsMenu`, e.g. via `ItemContextMenu`); the cell stays empty
   * otherwise.
   */
  rowMoreActions?: boolean;
  /**
   * Makes the whole row a click target — e.g. re-anchoring the page on the
   * row's item, rather than requiring a click on one specific cell. Also
   * gets `tabIndex={0}` and responds to Enter/Space, same focus treatment as
   * `rowContextMenu`.
   */
  onRowClick?: (row: T) => void;
  /**
   * Where a click on the row goes, when that is another page (a route change):
   * the row's menus lead with "Open in new tab" linking there. Return
   * `undefined` for a row whose click opens a modal, sidebar or expansion, and
   * leave the prop off a table whose rows all do. Needs a `RowActionsMenu`
   * row menu (`rowContextMenu`); it never adds a menu by itself.
   */
  rowHref?: (row: T) => string | undefined;
  /**
   * Per-row opt-out of `onRowClick`: a row it returns false for is inert (no
   * pointer cursor, no tab stop, no Enter/Space) so it never looks clickable
   * while doing nothing. Omit when every row opens something.
   */
  rowClickable?: (row: T) => boolean;
  /**
   * Adds a per-row disclosure: clicking a row opens `renderDetail`'s content
   * in a full-width row beneath it. Independent of `onRowClick` — both fire
   * on the same click when both are given, though no caller currently
   * combines them. See `DataTableExpandableRow`.
   */
  expandableRow?: DataTableExpandableRow<T>;
  /**
   * How the table behaves below `sm`. `'stack'` (the default) collapses each
   * row into a labelled card — see `.dt-stack` in `src/styles/index.css`.
   * `'table'` keeps real columns: right when comparing across columns is
   * the point (compare table, matrix, roster, wide numbers), interactive or
   * not: it scrolls sideways, with the key column pinned by `stickyStart`
   * (§6c Restraint). Cards are for rows read as a unit.
   */
  responsive?: 'stack' | 'table';
  /**
   * How many values sit side by side inside one stacked card. `1` (the
   * default) gives each field its own line with the label in a left gutter —
   * right whenever a value can be long (a station name, an item name).
   * `2` pairs them up with the label above the value, for a card of short
   * figures where one-per-line would leave half the screen empty. Ignored
   * unless `responsive` is `'stack'`.
   */
  stackColumns?: 1 | 2;
  /**
   * `'labelled'` (the default) is the card above: one labelled field per
   * line. `'dense'` is a two-line card for a long list a reader *scans*
   * rather than reads — title and `cardCorner` figure on line one, every
   * other value inline on line two, unlabelled (`stackAffix` supplies the
   * words), so a phone shows three times the rows. Only matters when
   * `responsive` is `'stack'`; `stackColumns` is ignored when dense.
   */
  stackLayout?: 'labelled' | 'dense';
  /**
   * Whether the table shows as cards, in place of the viewport check (below
   * `sm`) every other table uses — for a table that knows its own width and
   * is narrower than its columns on a wide screen (Hauling's panel on a
   * tablet with the rail open). Cards still need `responsive="stack"`. The
   * caller's `max-sm:`/`sm:` cell classes keep following the viewport, so a
   * table that forces cards picks those in JS (ADR 0017).
   */
  stacked?: boolean;
  /**
   * A phone-only (below `sm`) sort picker above the table. The stacked card
   * hides the header row, and with it every sort button — so a sortable
   * table is unsortable on a phone without this. Drives the same sort state
   * the header buttons do. Renders nothing if no column declares
   * `sortValue`.
   */
  mobileSort?: boolean;
  /** Phone-only text left of the sort picker (e.g. "214 offers"). Only rendered with `mobileSort`. */
  stackSummary?: ReactNode;
  /** Phone-only controls right of the sort picker (e.g. a filter trigger). Only rendered with `mobileSort`. */
  stackActions?: ReactNode;
  /**
   * Grouping of equal-keyed rows behind a toggle row — see
   * `DataTableGroupBy`. Phone-only by default: at `sm` and up the rows have
   * the width to sit side by side and a reader compares them column-wise,
   * unless the group sets `allWidths`.
   */
  groupBy?: DataTableGroupBy<T>;
  /**
   * A row that is not a record but a note between records — Route Safety's
   * wormhole jump between two systems (issue #2476). Return its content to
   * draw the row as one cell across every column (and one unlabelled line on
   * a phone card); `null` draws the row as usual. Such a row never expands,
   * never activates `onRowClick`, and never goes through a column's `render`.
   * Not for a virtualized table: the row is not measured.
   */
  fullWidthRow?: (row: T) => ReactNode | null;
  /**
   * Mounts only the rows near the viewport (TanStack Virtual, windowed
   * against the page the way `NotificationsPanel` is), so a list of tens of
   * thousands — a region-wide public contract snapshot — costs what a
   * screenful does. Every row stays reachable by scrolling; sorting still
   * runs over the whole set first. Unmounted rows are stood in for by two
   * `aria-hidden` spacer rows, so column widths stay the table's own.
   *
   * `'auto'` windows only once the table holds more than
   * `VIRTUALIZE_THRESHOLD` rows — for a ledger that is usually a screenful
   * but can run to thousands (a wallet journal, a market history). A short
   * list keeps every row in the DOM, so find-in-page and a short fixture
   * behave exactly as an unvirtualized table.
   *
   * A windowed `highlightRowKey` is scrolled to through the virtualizer, so
   * the row mounts before it is focused and pulsed. Phone `groupBy` renders
   * unwindowed: collapsed groups mount nothing, and the toggle rows would
   * need their own measuring. An `expandableRow` detail is measured as part
   * of the row it opens beneath, so expanding one moves the rows below it
   * down rather than under it.
   */
  virtualize?: boolean | 'auto';
  /**
   * Hands the caller the rows in on-screen order — the table sorts
   * internally, so an export that wants to match what the reader sees reads
   * them through this rather than re-sorting its own copy. Usually spread
   * from `useTableExport(...).tableProps` (see `TableExport.tsx`).
   */
  exportRef?: Ref<DataTableExportHandle<T>>;
  /**
   * Makes the table exportable from its menus: every row menu
   * (`rowContextMenu`, and its "More actions" button) gains an "Export
   * table" submenu, and a table without row menus gets a table-wide
   * right-click menu holding just the export formats. Exports the rows as sorted on
   * screen. Usually spread from `useTableExport(...).tableProps` together
   * with `exportRef`, so the title bar's `TableActionsMenu` agrees.
   */
  exportable?: TableExportConfig<T>;
}
