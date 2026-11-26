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

export type SizePresetId = 'small' | 'normal' | 'large' | 'huge';

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

export function sizePresetOf(px: number | null): SizePresetId | null {
  return MAIL_SIZE_PRESETS.find((p) => p.px === px)?.id ?? null;
}

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

export function normalizeHexColor(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#ff${hex.toLowerCase()}`;
}

export function normalizeLinkInput(input: string): string | null {
  const value = input.trim();
  if (value === '') return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  const target = classifyMarkupLink(withScheme);
  return target?.kind === 'http' ? target.url : null;
}

export const MAIL_LINK_TEXT_MAX = 200;

export interface LinkTarget {
  from: number;
  to: number;
  text: string;
  href: string | null;
  markOnly?: boolean;
  ranges?: readonly (readonly [number, number])[];
}

export interface LinkDraft {
  text: string;
  url: string;
}

export function linkDraftOf(target: LinkTarget): LinkDraft {
  return { text: target.markOnly ? '' : target.text, url: target.href ?? '' };
}

export type LinkFormResult =
  { ok: true; text: string; href: string } | { ok: false; errors: { url?: true; text?: true } };

export function validateLinkForm(form: LinkDraft, prefilledText?: string): LinkFormResult {
  const href = normalizeLinkInput(form.url);
  const errors: { url?: true; text?: true } = {};
  if (href === null) errors.url = true;
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
  return { from: lo, to: hi, text: markupPlainText(nodes), href: null };
}

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

export interface FormatRun {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string | null;
  size: number | null;
  link: string | null;
}

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

export type SourceTag =
  | { kind: 'bold' | 'italic' | 'underline' }
  | { kind: 'size'; px: number }
  | { kind: 'color'; color: string }
  | { kind: 'link'; href: string };

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
  start: number;
  end: number;
}

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

function cellToPipe(text: string): string {
  return text
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\|/g, '¦')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

export function buildPipeTableLines(rows: readonly (readonly string[])[]): string[] {
  const line = (cells: readonly string[]) => `| ${cells.map(cellToPipe).join(' | ')} |`;
  const width = Math.max(1, ...rows.map((r) => r.length));
  const out = rows.map((r) => line(r));
  if (out.length > 0) out.splice(1, 0, `|${Array.from({ length: width }, () => '---').join('|')}|`);
  return out;
}

export type PipeBlock =
  | { kind: 'text'; start: number; end: number }
  | { kind: 'table'; start: number; end: number; rows: string[][] };

function rectangular(rows: string[][]): string[][] {
  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array.from({ length: width - r.length }, () => '')]);
}

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

export function parsePastedPipeTable(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const blocks = splitPipeBlocks(lines);
  return blocks.length === 1 && blocks[0].kind === 'table' ? blocks[0].rows : null;
}
