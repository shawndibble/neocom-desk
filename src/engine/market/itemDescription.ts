/**
 * Parses the small HTML-ish markup subset CCP embeds in ESI item
 * descriptions (`<font size><b>`, `<i>`, `<u>`, `<br>`, `<a href="showinfo:...">`)
 * into plain formatted runs. Never produces raw HTML: the caller renders
 * runs as React elements, not via `dangerouslySetInnerHTML` — descriptions
 * are CCP-authored, but the project has already rejected that XSS surface
 * for authored content once (docs/plans/feature-parity/briefs/K-libraries.md).
 * `showinfo:` is an EVE client protocol and dead in a browser, so `<a>` tags
 * are dropped and only their label text kept. Any tag this doesn't
 * recognize (`<font>`, `<color>`, legacy `<url>`, ...) is stripped the same
 * way — dropped, inner text kept, no style applied.
 */

export interface DescriptionRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCharCode(code);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const TAG = /<\/?([a-zA-Z][\w-]*)\b[^>]*?\/?>/g;

/** Open-tag depth per style, so nested `<b>...<b>...</b>...</b>` stays bold until the outer close. */
interface StyleDepth {
  b: number;
  i: number;
  u: number;
}

function currentStyle(depth: StyleDepth): DescriptionRun {
  return { text: '', bold: depth.b > 0, italic: depth.i > 0, underline: depth.u > 0 };
}

function sameStyle(a: DescriptionRun, b: DescriptionRun): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline;
}

export function parseItemDescription(raw: string): DescriptionRun[] {
  if (!raw) return [];

  const runs: DescriptionRun[] = [];
  const depth: StyleDepth = { b: 0, i: 0, u: 0 };
  let buffer: DescriptionRun | null = null;

  const flush = () => {
    if (buffer?.text) runs.push(buffer);
    buffer = null;
  };

  const append = (text: string) => {
    if (!text) return;
    const style = currentStyle(depth);
    if (buffer && !sameStyle(buffer, style)) flush();
    buffer ??= style;
    buffer.text += text;
  };

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((match = TAG.exec(raw)) !== null) {
    if (match.index > lastIndex) append(decodeEntities(raw.slice(lastIndex, match.index)));

    const isClosing = match[0].startsWith('</');
    switch (match[1].toLowerCase()) {
      case 'b':
        depth.b = isClosing ? Math.max(0, depth.b - 1) : depth.b + 1;
        break;
      case 'i':
        depth.i = isClosing ? Math.max(0, depth.i - 1) : depth.i + 1;
        break;
      case 'u':
        depth.u = isClosing ? Math.max(0, depth.u - 1) : depth.u + 1;
        break;
      case 'br':
        append('\n');
        break;
      default:
        break; // font, a, color, url, ... — dropped, inner text kept unstyled
    }
    lastIndex = TAG.lastIndex;
  }
  if (lastIndex < raw.length) append(decodeEntities(raw.slice(lastIndex)));
  flush();

  return runs;
}
