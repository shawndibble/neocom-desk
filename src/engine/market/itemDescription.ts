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

export function parseItemDescription(raw: string): DescriptionRun[] {
  if (!raw) return [];

  const runs: DescriptionRun[] = [];
  let bold = 0;
  let italic = 0;
  let underline = 0;
  let buffer = '';
  let bufferBold = false;
  let bufferItalic = false;
  let bufferUnderline = false;

  const flush = () => {
    if (buffer) runs.push({ text: buffer, bold: bufferBold, italic: bufferItalic, underline: bufferUnderline });
    buffer = '';
  };

  const append = (text: string) => {
    if (!text) return;
    const style = { b: bold > 0, i: italic > 0, u: underline > 0 };
    if (buffer && (style.b !== bufferBold || style.i !== bufferItalic || style.u !== bufferUnderline)) {
      flush();
    }
    if (!buffer) {
      bufferBold = style.b;
      bufferItalic = style.i;
      bufferUnderline = style.u;
    }
    buffer += text;
  };

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((match = TAG.exec(raw)) !== null) {
    if (match.index > lastIndex) append(decodeEntities(raw.slice(lastIndex, match.index)));

    const isClosing = match[0].startsWith('</');
    switch (match[1].toLowerCase()) {
      case 'b':
        bold = isClosing ? Math.max(0, bold - 1) : bold + 1;
        break;
      case 'i':
        italic = isClosing ? Math.max(0, italic - 1) : italic + 1;
        break;
      case 'u':
        underline = isClosing ? Math.max(0, underline - 1) : underline + 1;
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
