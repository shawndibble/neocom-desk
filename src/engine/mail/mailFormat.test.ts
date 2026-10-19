import { describe, expect, it } from 'vitest';
import { MARKUP_MAX_SIZE, MARKUP_MIN_SIZE, parseEveMarkup, serializeEveMarkup } from './eveMarkup';
import {
  MAIL_COLOR_SWATCHES,
  MAIL_SIZE_PRESETS,
  buildPipeTableLines,
  emptyFormatState,
  formatStateOfRuns,
  normalizeHexColor,
  MAIL_LINK_TEXT_MAX,
  normalizeLinkInput,
  linkDraftOf,
  planSourceLink,
  sourceLinkAt,
  validateLinkForm,
  parsePastedPipeTable,
  sizePresetOf,
  sourceTagPair,
  wrapSourceSelection,
  type FormatRun,
} from './mailFormat';

const plain: FormatRun = {
  bold: false,
  italic: false,
  underline: false,
  color: null,
  size: null,
  link: null,
};

describe('presets', () => {
  it('keeps every size within the markup limits and in ascending order', () => {
    const sizes = MAIL_SIZE_PRESETS.flatMap((p) => (p.px === null ? [] : [p.px]));
    for (const px of sizes) {
      expect(px).toBeGreaterThanOrEqual(MARKUP_MIN_SIZE);
      expect(px).toBeLessThanOrEqual(MARKUP_MAX_SIZE);
    }
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(MAIL_SIZE_PRESETS.map((p) => p.id)).toEqual(['small', 'normal', 'large', 'huge']);
  });
  it('maps a size back to its preset id, normal for the default', () => {
    expect(sizePresetOf(null)).toBe('normal');
    expect(sizePresetOf(MAIL_SIZE_PRESETS[0].px)).toBe('small');
    expect(sizePresetOf(17)).toBeNull();
  });
  it('offers only opaque swatches', () => {
    for (const c of MAIL_COLOR_SWATCHES) expect(c).toMatch(/^#ff[0-9a-f]{6}$/);
    expect(new Set(MAIL_COLOR_SWATCHES).size).toBe(MAIL_COLOR_SWATCHES.length);
  });
});

describe('normalizeHexColor', () => {
  it.each([
    ['#FF8800', '#ffff8800'],
    ['ff8800', '#ffff8800'],
    ['#f80', '#ffff8800'],
    ['  #AbC ', '#ffaabbcc'],
  ])('%s -> %s', (input, out) => expect(normalizeHexColor(input)).toBe(out));
  it.each(['', '#12', '#12345', 'zzzzzz', '#80ff8800', 'red'])('rejects %j', (bad) =>
    expect(normalizeHexColor(bad)).toBeNull()
  );
});

describe('formatStateOfRuns', () => {
  it('is empty with no runs', () => {
    expect(formatStateOfRuns([])).toEqual(emptyFormatState);
  });
  it('is active only when every run has the mark', () => {
    const s = formatStateOfRuns([
      { ...plain, bold: true, italic: true },
      { ...plain, bold: true },
    ]);
    expect(s.bold).toBe(true);
    expect(s.italic).toBe(false);
  });
  it('reports a shared colour and size, mixed otherwise', () => {
    const red = '#ffff0000';
    expect(
      formatStateOfRuns([
        { ...plain, color: red },
        { ...plain, color: red },
      ]).color
    ).toBe(red);
    expect(formatStateOfRuns([{ ...plain, color: red }, plain]).color).toBe('mixed');
    expect(
      formatStateOfRuns([
        { ...plain, size: 16 },
        { ...plain, size: 24 },
      ]).size
    ).toBe('mixed');
    expect(formatStateOfRuns([plain]).color).toBeNull();
  });
  it('reports a shared link href', () => {
    const l = { ...plain, link: 'https://a.example/' };
    expect(formatStateOfRuns([l, l]).link).toBe('https://a.example/');
    expect(formatStateOfRuns([l, plain]).link).toBe('mixed');
  });
});

describe('sourceTagPair / wrapSourceSelection', () => {
  it('builds the same tags the serializer emits', () => {
    expect(sourceTagPair({ kind: 'bold' })).toEqual(['<b>', '</b>']);
    expect(sourceTagPair({ kind: 'size', px: 16 })).toEqual(['<font size="16">', '</font>']);
    expect(sourceTagPair({ kind: 'color', color: '#ffff0000' })).toEqual([
      '<font color="#ffff0000">',
      '</font>',
    ]);
    expect(sourceTagPair({ kind: 'link', href: 'https://a.example/?x=1&y=2' })).toEqual([
      '<a href="https://a.example/?x=1&amp;y=2">',
      '</a>',
    ]);
  });
  it('wraps a selection and keeps it selected', () => {
    const r = wrapSourceSelection('hello world', 6, 11, ['<b>', '</b>']);
    expect(r.value).toBe('hello <b>world</b>');
    expect(r.start).toBe(9);
    expect(r.end).toBe(14);
  });
  it('puts the caret between the tags with no selection', () => {
    const r = wrapSourceSelection('ab', 1, 1, ['<i>', '</i>']);
    expect(r.value).toBe('a<i></i>b');
    expect(r.start).toBe(4);
    expect(r.end).toBe(4);
  });
  it('produces markup that parses to the formatting', () => {
    const r = wrapSourceSelection('x', 0, 1, sourceTagPair({ kind: 'underline' }));
    expect(parseEveMarkup(r.value)).toEqual([
      { type: 'u', children: [{ type: 'text', text: 'x' }] },
    ]);
  });
});

describe('tables', () => {
  it('builds pipe rows with a separator after the header', () => {
    expect(
      buildPipeTableLines([
        ['a', 'b'],
        ['1', '2'],
      ])
    ).toEqual(['| a | b |', '|---|---|', '| 1 | 2 |']);
  });
  it('entity-escapes cell text, swaps pipes and flattens newlines', () => {
    expect(
      buildPipeTableLines([
        ['a<b', 'x|y\nz'],
        ['&', ''],
      ])
    ).toEqual(['| a&lt;b | x¦y z |', '|---|---|', '| &amp; |  |']);
  });
  it('round-trips through the markup parser as plain pipe text', () => {
    const src = buildPipeTableLines([['a<b', 'c']]).join('\n');
    expect(serializeEveMarkup(parseEveMarkup(src))).toBe(src);
  });
  it('parses a pasted markdown pipe table into rectangular rows', () => {
    expect(parsePastedPipeTable('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | |')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', ''],
    ]);
    expect(parsePastedPipeTable('a | b\n--|--\n1 | 2')).toBeNull();
  });
  it('does not treat prose around the table, or one row, as a table', () => {
    expect(parsePastedPipeTable('hello\n| a | b |\n| 1 | 2 |')).toBeNull();
    expect(parsePastedPipeTable('| a | b |')).toBeNull();
    expect(parsePastedPipeTable('**bold** text')).toBeNull();
    expect(parsePastedPipeTable('a    b    c\n1    2    3')).toBeNull();
  });
});

describe('normalizeLinkInput', () => {
  it.each([
    ['https://a.example/p?x=1', 'https://a.example/p?x=1'],
    ['a.example', 'https://a.example'],
    ['http://a.example', 'http://a.example'],
  ])('accepts %s', (input, out) => expect(normalizeLinkInput(input)).toBe(out));
  it.each(['', 'javascript:alert(1)', 'showinfo:1373//1', 'ftp://a.example', 'a b'])(
    'rejects %j',
    (input) => expect(normalizeLinkInput(input)).toBeNull()
  );
});

describe('link dialog', () => {
  it('prefills from the selection, the caret, or the link under it', () => {
    expect(linkDraftOf({ from: 3, to: 8, text: 'hello', href: null })).toEqual({
      text: 'hello',
      url: '',
    });
    expect(linkDraftOf({ from: 3, to: 3, text: '', href: null })).toEqual({ text: '', url: '' });
    expect(linkDraftOf({ from: 2, to: 9, text: 'full text', href: 'https://a.example/' })).toEqual({
      text: 'full text',
      url: 'https://a.example/',
    });
  });

  it('validates the URL as http(s) and the text length', () => {
    expect(validateLinkForm({ text: 'x', url: 'example.com' })).toEqual({
      ok: true,
      text: 'x',
      href: 'https://example.com',
    });
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'showinfo:1377//1', '']) {
      expect(validateLinkForm({ text: 'x', url })).toEqual({ ok: false, errors: { url: true } });
    }
    expect(validateLinkForm({ text: 'a'.repeat(MAIL_LINK_TEXT_MAX + 1), url: 'a.b' })).toEqual({
      ok: false,
      errors: { text: true },
    });
  });

  it('uses the URL as the text when the text is empty', () => {
    expect(validateLinkForm({ text: '  ', url: 'https://a.example/x' })).toEqual({
      ok: true,
      text: 'https://a.example/x',
      href: 'https://a.example/x',
    });
  });

  it('skips the length check for a prefill left unchanged', () => {
    const long = 'a'.repeat(MAIL_LINK_TEXT_MAX + 50);
    expect(validateLinkForm({ text: long, url: 'a.b' }, long)).toEqual({
      ok: true,
      text: long,
      href: 'https://a.b',
    });
    expect(validateLinkForm({ text: long + 'x', url: 'a.b' }, long).ok).toBe(false);
  });

  it('prefills no text when only the mark can be applied', () => {
    expect(linkDraftOf({ from: 1, to: 9, text: 'a b', href: null, markOnly: true })).toEqual({
      text: '',
      url: '',
    });
  });
});

describe('source-mode link', () => {
  it('inserts a tag at the caret and replaces a selection, escaping the text', () => {
    const caret = planSourceLink('ab', 1, 1, {
      text: 'a <b> & c',
      href: 'https://x.example/?a=1&b=2',
    });
    expect(caret.value).toBe('a<a href="https://x.example/?a=1&amp;b=2">a &lt;b&gt; &amp; c</a>b');
    expect(caret.value.slice(caret.start, caret.end)).toBe(
      '<a href="https://x.example/?a=1&amp;b=2">a &lt;b&gt; &amp; c</a>'
    );
    const sel = planSourceLink('say hi now', 4, 6, { text: 'hi', href: 'https://x.example/' });
    expect(sel.value).toBe('say <a href="https://x.example/">hi</a> now');
  });

  it('reads an exactly-selected existing tag, else the plain selection', () => {
    const src = 'go <a href="https://x.example/?a=1&amp;b=2">here &amp; there</a> ok';
    const from = 3;
    const to = src.indexOf('</a>') + 4;
    expect(sourceLinkAt(src, from, to)).toEqual({
      from,
      to,
      text: 'here & there',
      href: 'https://x.example/?a=1&b=2',
    });
    expect(sourceLinkAt('x a &amp; b y', 2, 11).text).toBe('a & b');
    expect(sourceLinkAt('x a &lt; b y', 2, 10).text).toBe('a < b');
    expect(sourceLinkAt('x <b>x</b> y', 2, 10)).toMatchObject({ text: 'x', href: null });
    expect(sourceLinkAt('abc', 1, 1)).toEqual({ from: 1, to: 1, text: '', href: null });
  });

  it('replaces the whole existing tag', () => {
    const src = '<a href="https://x.example/">old</a>';
    const t = sourceLinkAt(src, 0, src.length);
    const edit = planSourceLink(src, t.from, t.to, { text: 'new', href: 'https://y.example/' });
    expect(edit.value).toBe('<a href="https://y.example/">new</a>');
  });
});
