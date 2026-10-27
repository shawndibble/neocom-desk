/**
 * Editor-independent logic behind the mail format bar: size and colour
 * presets, toolbar state from the runs a selection covers, source-mode tag
 * wrapping, and pipe tables (the only table EVE mail can carry). Pure: the
 * wire format itself stays `eveMarkup.ts`'s job; tags here are produced by
 * its serializer, never typed out a second time.
 */
import {
  MARKUP_MAX_SIZE,
  MARKUP_MIN_SIZE,
  classifyMarkupLink,
  markupPlainText,
  parseEveMarkup,
  serializeEveMarkup,
  type MarkupNode,
} from './eveMarkup';
import { splitMailLines } from './mailBodyBlocks';

// --- Presets ---------------------------------------------------------------

export type SizePresetId = 'small' | 'normal' | 'large' | 'huge';

/**
 * Size steps. `normal` is "no size tag": the game's own default applies, so a
 * mail that never touches size carries no `<font size>` at all. The px values
 * are relative to the client's default mail text and sit inside the markup's
 * 6–64 range; they are unverified in game until the test mail
 * (docs/features/mail.md "Verification checklist").
 */
export const MAIL_SIZE_PRESETS: readonly { id: SizePresetId; px: number | null }[] = [
  { id: 'small', px: 10 },
  { id: 'normal', px: null },
  { id: 'large', px: 16 },
  { id: 'huge', px: 24 },
];

for (const p of MAIL_SIZE_PRESETS) {
  if (p.px !== null && (p.px < MARKUP_MIN_SIZE || p.px > MARKUP_MAX_SIZE)) {
    throw new Error(`size preset ${p.id} outside the markup range`);
  }
}

/** The preset a size belongs to (`null` size is `normal`), or `null` for a custom size. */
export function sizePresetOf(px: number | null): SizePresetId | null {
  return MAIL_SIZE_PRESETS.find((p) => p.px === px)?.id ?? null;
}

/** Opaque `#aarrggbb` swatches, chosen to read on the dark mail surface. */
export const MAIL_COLOR_SWATCHES: readonly string[] = [
  '#ffffffff',
  '#ffbfbfbf',
  '#ffff5555',
  '#ffff9a3c',
  '#ffffd24d',
  '#ff6fe36f',
  '#ff4dd2c2',
  '#ff5aa9ff',
  '#ffa98bff',
  '#ffff7ad6',
  '#ffb08a5a',
  '#ff8a8a8a',
];

/** `#rgb` / `#rrggbb` (hash optional) as opaque `#ffrrggbb`; `null` when not a hex colour. */
export function normalizeHexColor(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#ff${hex.toLowerCase()}`;
}

/** Adds `https://` to a bare address, and accepts only http(s). */
export function normalizeLinkInput(input: string): string | null {
  const value = input.trim();
  if (value === '') return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  const target = classifyMarkupLink(withScheme);
  return target?.kind === 'http' ? target.url : null;
}

// --- Link dialog -----------------------------------------------------------

/** Longest visible link text the dialog accepts. */
export const MAIL_LINK_TEXT_MAX = 200;

/**
 * The range a link edit replaces, and what is in it. A caret is an empty range;
 * a caret or selection inside an existing link widens to that link's whole
 * range with its `href`. Positions are the surface's own (editor or textarea).
 */
export interface LinkTarget {
  from: number;
  to: number;
  text: string;
  href: string | null;
  /**
   * The selection spans blocks or table cells, so replacing it with one text node
   * would merge blocks or mangle the table: only the link mark is applied, to
   * `ranges` (or `[from, to]`), and the text is left alone.
   */
  markOnly?: boolean;
  ranges?: readonly (readonly [number, number])[];
}

export interface LinkDraft {
  text: string;
  url: string;
}

/** What the two fields start with. */
export function linkDraftOf(target: LinkTarget): LinkDraft {
  return { text: target.markOnly ? '' : target.text, url: target.href ?? '' };
}

export type LinkFormResult =
  { ok: true; text: string; href: string } | { ok: false; errors: { url?: true; text?: true } };

/** Checks the fields; empty text falls back to the address as the visible text. */
export function validateLinkForm(form: LinkDraft, prefilledText?: string): LinkFormResult {
  const href = normalizeLinkInput(form.url);
  const errors: { url?: true; text?: true } = {};
  if (href === null) errors.url = true;
  // A long selection prefilled and left alone must still link by address alone.
  if (form.text.length > MAIL_LINK_TEXT_MAX && form.text !== prefilledText) errors.text = true;
  if (href === null || errors.text) return { ok: false, errors };
  return { ok: true, text: form.text.trim() === '' ? href : form.text, href };
}

function linkTagOf(form: { text: string; href: string }): string {
  return serializeEveMarkup([
    {
      type: 'link',
      href: form.href,
      target: { kind: 'http', url: form.href },
      children: [{ type: 'text', text: form.text }],
    },
  ]);
}

/** Source view: the selection, or the whole `<a>` tag when that is exactly what is selected. */
export function sourceLinkAt(source: string, from: number, to: number): LinkTarget {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const selected = source.slice(lo, hi);
  if (selected === '') return { from: lo, to: hi, text: '', href: null };
  const nodes = parseEveMarkup(selected);
  const only = nodes.length === 1 ? nodes[0] : null;
  if (
    only?.type === 'link' &&
    only.target?.kind === 'http' &&
    /^<a\s[^>]*>[\s\S]*<\/a>$/i.test(selected)
  ) {
    return { from: lo, to: hi, text: markupPlainText(only.children), href: only.href };
  }
  // The visible text, so the serializer escaping it again on apply does not double-escape.
  return { from: lo, to: hi, text: markupPlainText(nodes), href: null };
}

/** Source view: write `<a href="URL">TEXT</a>` over the range, the tag selected after. */
export function planSourceLink(
  source: string,
  from: number,
  to: number,
  form: { text: string; href: string }
): SourceEdit {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const tag = linkTagOf(form);
  return {
    value: source.slice(0, lo) + tag + source.slice(hi),
    start: lo,
    end: lo + tag.length,
  };
}

// --- Toolbar state ---------------------------------------------------------

/** The formatting of one stretch of text (or of the caret). */
export interface FormatRun {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string | null;
  size: number | null;
  link: string | null;
}

/** What the format bar shows: a mark is on only when the whole selection has it. */
export interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string | 'mixed' | null;
  size: number | 'mixed' | null;
  link: string | 'mixed' | null;
}

export const emptyFormatState: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  color: null,
  size: null,
  link: null,
};

function shared<T>(values: readonly T[]): T | 'mixed' {
  return values.every((v) => v === values[0]) ? values[0] : 'mixed';
}

export function formatStateOfRuns(runs: readonly FormatRun[]): FormatState {
  if (runs.length === 0) return emptyFormatState;
  return {
    bold: runs.every((r) => r.bold),
    italic: runs.every((r) => r.italic),
    underline: runs.every((r) => r.underline),
    color: shared(runs.map((r) => r.color)),
    size: shared(runs.map((r) => r.size)),
    link: shared(runs.map((r) => r.link)),
  };
}

// --- Source mode -----------------------------------------------------------

export type SourceTag =
  | { kind: 'bold' | 'italic' | 'underline' }
  | { kind: 'size'; px: number }
  | { kind: 'color'; color: string }
  | { kind: 'link'; href: string };

/** The open and close tag for a format, exactly as the serializer would write them. */
export function sourceTagPair(tag: SourceTag): [string, string] {
  const marker = '\u0000';
  const children: MarkupNode[] = [{ type: 'text', text: marker }];
  const node: MarkupNode = (() => {
    switch (tag.kind) {
      case 'bold':
        return { type: 'b', children };
      case 'italic':
        return { type: 'i', children };
      case 'underline':
        return { type: 'u', children };
      case 'size':
        return { type: 'size', px: tag.px, children };
      case 'color':
        return { type: 'color', color: tag.color, children };
      case 'link':
        return {
          type: 'link',
          href: tag.href,
          target: { kind: 'http', url: tag.href },
          children,
        };
    }
  })();
  const [open, close] = serializeEveMarkup([node]).split(marker);
  return [open, close];
}

export interface SourceEdit {
  value: string;
  /** New selection, in the edited string. */
  start: number;
  end: number;
}

/** Wraps `[from, to)` in a tag pair; with no selection the caret lands between the tags. */
export function wrapSourceSelection(
  source: string,
  from: number,
  to: number,
  [open, close]: readonly [string, string]
): SourceEdit {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return {
    value: source.slice(0, lo) + open + source.slice(lo, hi) + close + source.slice(hi),
    start: lo + open.length,
    end: hi + open.length,
  };
}

// --- Tables ----------------------------------------------------------------

function cellToPipe(text: string): string {
  return text
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\|/g, '¦')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

/** Pipe rows for a table, header first, a `|---|` separator under it. EVE has no table markup. */
export function buildPipeTableLines(rows: readonly (readonly string[])[]): string[] {
  const line = (cells: readonly string[]) => `| ${cells.map(cellToPipe).join(' | ')} |`;
  const width = Math.max(1, ...rows.map((r) => r.length));
  const out = rows.map((r) => line(r));
  if (out.length > 0) out.splice(1, 0, `|${Array.from({ length: width }, () => '---').join('|')}|`);
  return out;
}

/** A pipe-table block in a list of plain-text lines. */
export type PipeBlock =
  | { kind: 'text'; start: number; end: number }
  | { kind: 'table'; start: number; end: number; rows: string[][] };

function rectangular(rows: string[][]): string[][] {
  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array.from({ length: width - r.length }, () => '')]);
}

/**
 * Splits plain-text lines into prose and markdown pipe tables. Space-aligned
 * tables (which the reader also draws) stay prose here: the editor only makes
 * tables out of `| a | b |` rows.
 */
export function splitPipeBlocks(lines: readonly string[]): PipeBlock[] {
  return splitMailLines(lines).flatMap((b): PipeBlock[] => {
    if (b.kind === 'text') return [b];
    const pipe = lines
      .slice(b.start, b.end)
      .every((l) => l.trim() === '' || l.trim().startsWith('|'));
    const cols = Math.max(...b.rows.map((r) => r.length));
    if (!pipe || cols < 2) return [{ kind: 'text', start: b.start, end: b.end }];
    return [{ kind: 'table', start: b.start, end: b.end, rows: rectangular(b.rows) }];
  });
}

/** A pasted markdown pipe table as rows, or `null` unless the whole paste is exactly one. */
export function parsePastedPipeTable(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const blocks = splitPipeBlocks(lines);
  return blocks.length === 1 && blocks[0].kind === 'table' ? blocks[0].rows : null;
}
