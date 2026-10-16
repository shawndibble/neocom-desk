/**
 * EVE markup: the small HTML-ish tag language an EVE mail body is written in
 * (GLOSSARY "EVE Markup"). One parse → typed tree → serialize module shared by
 * the mail reader and the composer, so both agree on what is safe.
 *
 * Pure: no fetch, DOM or Dexie. The tree can only hold what the safe subset
 * allows (bold, italic, underline, size, colour, links with a known scheme),
 * so nothing a mail carries (style attributes, scripts, odd schemes) survives
 * parsing, and rendering the tree is safe by construction.
 *
 * Public API: `parseEveMarkup`, `serializeEveMarkup`, `eveMarkupLength`
 * (+ `EVE_MARKUP_LIMIT`), `classifyMarkupLink`, `markupColorToCss`,
 * `markupPlainText`, `splitMarkupLines`.
 */

/** The game's body limit, counted over the markup as sent. */
export const EVE_MARKUP_LIMIT = 10_000;
export const MARKUP_MIN_SIZE = 6;
export const MARKUP_MAX_SIZE = 64;

export type MarkupNode =
  | { type: 'text'; text: string }
  | { type: 'br' }
  | { type: 'b' | 'i' | 'u'; children: MarkupNode[] }
  | { type: 'size'; px: number; children: MarkupNode[] }
  /** `color` is `#aarrggbb` (alpha first), lowercase. */
  | { type: 'color'; color: string; children: MarkupNode[] }
  /** `href` has passed `classifyMarkupLink`; never a raw unvalidated string. */
  | { type: 'link'; href: string; children: MarkupNode[] };

export type InertScheme = 'fitting' | 'contract' | 'killReport' | 'joinChannel' | 'localsvc';

export type MarkupLinkTarget =
  | { kind: 'http'; url: string }
  | { kind: 'showinfo'; typeId: number; id: number | null }
  | { kind: 'inert'; scheme: InertScheme };

const INERT_SCHEMES: Record<string, InertScheme> = {
  fitting: 'fitting',
  contract: 'contract',
  killreport: 'killReport',
  joinchannel: 'joinChannel',
  localsvc: 'localsvc',
};

/** What a link href points at, or `null` when it is not an allowed link. */
export function classifyMarkupLink(href: string): MarkupLinkTarget | null {
  const value = href.trim();
  // Nothing that could break out of an attribute or smuggle a control char.
  // eslint-disable-next-line no-control-regex
  if (value === '' || /["'<>\s\u0000-\u001f]/.test(value)) return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value)?.[1].toLowerCase();
  if (scheme === undefined) return null;
  if (scheme === 'http' || scheme === 'https') {
    try {
      new URL(value);
    } catch {
      return null;
    }
    return { kind: 'http', url: value };
  }
  if (scheme === 'showinfo') {
    const m = /^showinfo:(\d{1,12})(?:\/\/(\d{1,15}))?$/i.exec(value);
    if (!m) return null;
    return { kind: 'showinfo', typeId: Number(m[1]), id: m[2] === undefined ? null : Number(m[2]) };
  }
  const inert = INERT_SCHEMES[scheme];
  return inert ? { kind: 'inert', scheme: inert } : null;
}

const COLOR_RE = /^(?:#|0x)([0-9a-f]{8}|[0-9a-f]{6})$/i;

/** `#aarrggbb`, from `#AARRGGBB`/`0xAARRGGBB` (alpha first, trailing `L` ok) or opaque RRGGBB. */
function parseColor(raw: string): string | null {
  const m = COLOR_RE.exec(raw.trim().replace(/l$/i, ''));
  if (!m) return null;
  const hex = m[1].toLowerCase();
  return `#${hex.length === 6 ? 'ff' : ''}${hex}`;
}

function parseSize(raw: string): number | null {
  const m = /^(\d{1,5})(?:px)?$/i.exec(raw.trim());
  if (!m) return null;
  return Math.min(MARKUP_MAX_SIZE, Math.max(MARKUP_MIN_SIZE, Number(m[1])));
}

/** `#aarrggbb` as a CSS `rgba(...)` colour. */
export function markupColorToCss(color: string): string {
  const [a, r, g, b] = [1, 3, 5, 7].map((i) => parseInt(color.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: ' ' };
function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|nbsp);/g, (_, name: string) => ENTITIES[name]);
}

function parseAttrs(rest: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** `<url=X>` / `<color=X>` / `<url:X>`: the value after `=` or `:`. */
function shorthandValue(rest: string): string {
  const v = rest
    .replace(/^\s*[=:]/, '')
    .replace(/\/$/, '')
    .trim();
  const q = /^(["'])(.*)\1$/.exec(v);
  return decode(q ? q[2] : v);
}

type Kind = 'b' | 'i' | 'u' | 'font' | 'color' | 'fontsize' | 'link';
interface Frame {
  kind: Kind;
  /** Close-tag names that end this frame. */
  closers: string[];
  wrap: (children: MarkupNode[]) => MarkupNode[];
  children: MarkupNode[];
}

const wrapWith =
  (type: 'b' | 'i' | 'u') =>
  (children: MarkupNode[]): MarkupNode[] => [{ type, children }];

function colorWrap(color: string | null) {
  return (c: MarkupNode[]): MarkupNode[] => (color ? [{ type: 'color', color, children: c }] : c);
}
function sizeWrap(px: number | null) {
  return (c: MarkupNode[]): MarkupNode[] => (px ? [{ type: 'size', px, children: c }] : c);
}
function linkWrap(href: string) {
  return (c: MarkupNode[]): MarkupNode[] =>
    classifyMarkupLink(href) ? [{ type: 'link', href: href.trim(), children: c }] : c;
}

function openFrame(name: string, rest: string): Frame | null {
  const frame = (kind: Kind, wrap: Frame['wrap'], closers = [name]): Frame => ({
    kind,
    closers,
    wrap,
    children: [],
  });
  switch (name) {
    case 'b':
    case 'i':
    case 'u':
      return frame(name, wrapWith(name));
    case 'font': {
      const a = parseAttrs(rest);
      const color = a.color === undefined ? null : parseColor(a.color);
      const px = a.size === undefined ? null : parseSize(a.size);
      return frame('font', (c) => sizeWrap(px)(colorWrap(color)(c)));
    }
    case 'color':
      return frame('color', colorWrap(parseColor(shorthandValue(rest))));
    case 'fontsize':
      return frame('fontsize', sizeWrap(parseSize(shorthandValue(rest))));
    case 'a':
      return frame('link', linkWrap(parseAttrs(rest).href ?? ''), ['a']);
    case 'url':
      return frame('link', linkWrap(shorthandValue(rest)), ['url']);
    default:
      return null;
  }
}

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/** Parse an EVE mail body into the safe node tree. Never throws. */
export function parseEveMarkup(src: string): MarkupNode[] {
  const root: Frame = { kind: 'b', closers: [], wrap: (c) => c, children: [] };
  const stack: Frame[] = [root];
  const top = (): Frame => stack[stack.length - 1];
  let skipNewline = false;

  const pushText = (raw: string): void => {
    let text = raw.replace(/\r\n?/g, '\n');
    if (skipNewline && text.startsWith('\n')) text = text.slice(1);
    skipNewline = false;
    text.split('\n').forEach((part, index) => {
      if (index > 0) top().children.push({ type: 'br' });
      if (part !== '') top().children.push({ type: 'text', text: decode(part) });
    });
  };
  const pop = (): void => {
    const frame = stack.pop()!;
    if (frame.children.length > 0) top().children.push(...frame.wrap(frame.children));
  };

  let last = 0;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(src)) !== null) {
    if (m.index > last) pushText(src.slice(last, m.index));
    last = TAG_RE.lastIndex;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    if (name === 'br' && !closing) {
      top().children.push({ type: 'br' });
      skipNewline = true;
      continue;
    }
    skipNewline = false;
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].closers.includes(name)) {
          while (stack.length > i) pop();
          break;
        }
      }
      continue;
    }
    const frame = openFrame(name, m[3]);
    if (frame) stack.push(frame);
  }
  if (last < src.length) pushText(src.slice(last));
  while (stack.length > 1) pop();
  return root.children;
}

const NBSP = String.fromCharCode(160);

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replaceAll(NBSP, '&nbsp;');
}

/** Serialize a tree as EVE markup, emitting only the safe subset (a break is a newline). */
export function serializeEveMarkup(nodes: readonly MarkupNode[]): string {
  return nodes
    .map((node): string => {
      switch (node.type) {
        case 'text':
          return escapeText(node.text);
        case 'br':
          return '\n';
        case 'b':
        case 'i':
        case 'u':
          return `<${node.type}>${serializeEveMarkup(node.children)}</${node.type}>`;
        case 'size':
          return `<font size="${node.px}">${serializeEveMarkup(node.children)}</font>`;
        case 'color':
          return `<font color="${node.color}">${serializeEveMarkup(node.children)}</font>`;
        case 'link':
          return `<a href="${node.href.replace(/&/g, '&amp;')}">${serializeEveMarkup(node.children)}</a>`;
      }
    })
    .join('');
}

/** Length as sent, markup included — compare with `EVE_MARKUP_LIMIT`. */
export function eveMarkupLength(input: string | readonly MarkupNode[]): number {
  return (typeof input === 'string' ? input : serializeEveMarkup(input)).length;
}

/** The text a tree reads as, breaks as newlines. */
export function markupPlainText(nodes: readonly MarkupNode[]): string {
  return nodes
    .map((node): string =>
      node.type === 'text' ? node.text : node.type === 'br' ? '\n' : markupPlainText(node.children)
    )
    .join('');
}

/** Split a tree at its breaks into lines; formatting is re-wrapped around each piece. */
export function splitMarkupLines(nodes: readonly MarkupNode[]): MarkupNode[][] {
  const lines: MarkupNode[][] = [[]];
  for (const node of nodes) {
    if (node.type === 'br') {
      lines.push([]);
    } else if (node.type === 'text') {
      lines[lines.length - 1].push(node);
    } else {
      splitMarkupLines(node.children).forEach((sub, index) => {
        if (index > 0) lines.push([]);
        if (sub.length > 0) lines[lines.length - 1].push({ ...node, children: sub });
      });
    }
  }
  return lines;
}
