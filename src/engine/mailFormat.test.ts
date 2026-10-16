import { describe, expect, it } from 'vitest';
import { MARKUP_MAX_SIZE, MARKUP_MIN_SIZE, parseEveMarkup, serializeEveMarkup } from './eveMarkup';
import {
  MAIL_COLOR_SWATCHES,
  MAIL_SIZE_PRESETS,
  buildPipeTableLines,
  emptyFormatState,
  formatStateOfRuns,
  normalizeHexColor,
  normalizeLinkInput,
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
