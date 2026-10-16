import { describe, it, expect } from 'vitest';
import {
  EVE_MARKUP_LIMIT,
  classifyMarkupLink,
  eveMarkupLength,
  markupColorToCss,
  markupPlainText,
  parseEveMarkup,
  serializeEveMarkup,
  splitMarkupLines,
  sliceMarkupNodes,
  MARKUP_MAX_DEPTH,
  type MarkupNode,
} from './eveMarkup';

const t = (text: string): MarkupNode => ({ type: 'text', text });
const rt = (src: string) => serializeEveMarkup(parseEveMarkup(src));

describe('parseEveMarkup', () => {
  it('reads bold, italic and underline', () => {
    expect(parseEveMarkup('<b>a</b><i>b</i><u>c</u>')).toEqual([
      { type: 'b', children: [t('a')] },
      { type: 'i', children: [t('b')] },
      { type: 'u', children: [t('c')] },
    ]);
  });

  it('reads <font size color> with quoted, single-quoted and bare attributes', () => {
    const want = [
      {
        type: 'size',
        px: 20,
        children: [{ type: 'color', color: '#ffff0000', children: [t('x')] }],
      },
    ];
    expect(parseEveMarkup('<font size="20" color="#ffff0000">x</font>')).toEqual(want);
    expect(parseEveMarkup("<font size='20' color='0xffff0000'>x</font>")).toEqual(want);
    expect(parseEveMarkup('<font size=20 color=#ffff0000>x</font>')).toEqual(want);
  });

  it('reads <color=...> and <fontsize=...>, stripping a trailing L', () => {
    expect(parseEveMarkup('<color=0xff00ff00L>g</color>')).toEqual([
      { type: 'color', color: '#ff00ff00', children: [t('g')] },
    ]);
    expect(parseEveMarkup('<fontsize=30>big</fontsize>')).toEqual([
      { type: 'size', px: 30, children: [t('big')] },
    ]);
  });

  it('treats a six-digit colour as opaque and drops an invalid one', () => {
    expect(parseEveMarkup('<color=#112233>x</color>')).toEqual([
      { type: 'color', color: '#ff112233', children: [t('x')] },
    ]);
    expect(parseEveMarkup('<color=red;background:url(x)>x</color>')).toEqual([t('x')]);
  });

  it('clamps sizes and drops a non-integer one', () => {
    expect(parseEveMarkup('<fontsize=9999>x</fontsize>')).toEqual([
      { type: 'size', px: 64, children: [t('x')] },
    ]);
    expect(parseEveMarkup('<fontsize=1>x</fontsize>')).toEqual([
      { type: 'size', px: 6, children: [t('x')] },
    ]);
    expect(parseEveMarkup('<fontsize=big>x</fontsize>')).toEqual([t('x')]);
  });

  it('treats <br> and a newline as one break, never both', () => {
    expect(parseEveMarkup('a<br>\nb')).toEqual([t('a'), { type: 'br' }, t('b')]);
    expect(parseEveMarkup('a<br />b\r\nc')).toEqual([
      t('a'),
      { type: 'br' },
      t('b'),
      { type: 'br' },
      t('c'),
    ]);
  });

  it('decodes only &amp; &lt; &gt; &nbsp;, once', () => {
    expect(parseEveMarkup('a &amp; b &lt;c&gt; &quot;&amp;lt;')).toEqual([
      t('a & b <c> &quot;&lt;'),
    ]);
    expect(parseEveMarkup('a&nbsp;b')).toEqual([t('a b')]);
  });

  it('keeps a bare < that is not a tag', () => {
    expect(parseEveMarkup('1 < 2 and 3 > 2')).toEqual([t('1 < 2 and 3 > 2')]);
  });

  it('closes unclosed tags at the end and tolerates crossed ones', () => {
    expect(parseEveMarkup('<b>a<i>b')).toEqual([
      { type: 'b', children: [t('a'), { type: 'i', children: [t('b')] }] },
    ]);
    expect(markupPlainText(parseEveMarkup('<b>a<i>b</b>c</i>d'))).toBe('abcd');
    expect(parseEveMarkup('x</b>y')).toEqual([t('x'), t('y')]);
  });

  it('drops unknown tags but keeps their contents', () => {
    expect(parseEveMarkup('<script>alert(1)</script><t>a</t><span style="x">b</span>')).toEqual([
      t('alert(1)'),
      t('a'),
      t('b'),
    ]);
  });

  it('reads <a href>, <url=> and legacy <url:>', () => {
    const want = [
      {
        type: 'link',
        href: 'https://a.example/x',
        target: { kind: 'http', url: 'https://a.example/x' },
        children: [t('go')],
      },
    ];
    expect(parseEveMarkup('<a href="https://a.example/x">go</a>')).toEqual(want);
    expect(parseEveMarkup('<url=https://a.example/x>go</url>')).toEqual(want);
    expect(parseEveMarkup('<url:https://a.example/x>go</url>')).toEqual(want);
  });

  it('turns an unknown or malformed link into inert text', () => {
    expect(parseEveMarkup('<a href="javascript:alert(1)">x</a>')).toEqual([t('x')]);
    expect(parseEveMarkup('<a href="showinfo:abc">x</a>')).toEqual([t('x')]);
    expect(parseEveMarkup(`<a href='https://a.example/"onclick'>x</a>`)).toEqual([t('x')]);
  });

  it('keeps the allowed EVE schemes as links', () => {
    for (const href of [
      'showinfo:1373//90000001',
      'fitting:588:1',
      'contract:30000142//1',
      'killReport:1:abc',
      'joinChannel:player_x',
      'localsvc:service=x',
    ]) {
      expect(parseEveMarkup(`<a href="${href}">x</a>`)).toEqual([
        { type: 'link', href, target: classifyMarkupLink(href), children: [t('x')] },
      ]);
    }
  });
});

describe('parser bounds', () => {
  it('flattens a link nested in a link, keeping its text', () => {
    const [outer] = parseEveMarkup(
      '<a href="https://a.example">x <a href="https://b.example">y</a> z</a>'
    );
    expect(outer).toMatchObject({ type: 'link', href: 'https://a.example' });
    const kids = (outer as Extract<MarkupNode, { type: 'link' }>).children;
    expect(kids.some((n) => n.type === 'link')).toBe(false);
    expect(markupPlainText([outer])).toBe('x y z');
  });

  it('ignores opens beyond the depth cap', () => {
    const src = '<b>'.repeat(MARKUP_MAX_DEPTH + 50) + 'deep' + '</b>'.repeat(MARKUP_MAX_DEPTH + 50);
    let depth = 0;
    let node: MarkupNode | undefined = parseEveMarkup(src)[0];
    while (node && 'children' in node) {
      depth++;
      node = node.children[0];
    }
    expect(depth).toBeLessThanOrEqual(MARKUP_MAX_DEPTH + 1);
    expect(markupPlainText(parseEveMarkup(src))).toBe('deep');
  });
});

describe('sliceMarkupNodes', () => {
  it('cuts a line at plain-text offsets, keeping formatting', () => {
    const line = parseEveMarkup('ab<b>cd</b>ef');
    expect(sliceMarkupNodes(line, 1, 5)).toEqual([
      t('b'),
      { type: 'b', children: [t('cd')] },
      t('e'),
    ]);
    expect(sliceMarkupNodes(line, 3, 3)).toEqual([]);
  });
});

describe('classifyMarkupLink', () => {
  it('classifies each scheme', () => {
    expect(classifyMarkupLink('showinfo:1373//90000001')).toEqual({
      kind: 'showinfo',
      typeId: 1373,
      id: 90000001,
    });
    expect(classifyMarkupLink('showinfo:587')).toEqual({ kind: 'showinfo', typeId: 587, id: null });
    expect(classifyMarkupLink('HTTPS://a.example')).toEqual({
      kind: 'http',
      url: 'HTTPS://a.example',
    });
    expect(classifyMarkupLink('fitting:1')).toEqual({ kind: 'inert', scheme: 'fitting' });
    expect(classifyMarkupLink('killreport:1')).toEqual({ kind: 'inert', scheme: 'killReport' });
    expect(classifyMarkupLink('ftp://x')).toBeNull();
    expect(classifyMarkupLink('showinfo:1//')).toBeNull();
  });
});

describe('serializeEveMarkup', () => {
  it('emits only the safe subset and round-trips', () => {
    const src =
      '<b>hi</b> <font size="20"><font color="#ff112233">x &amp; y</font></font>\n<a href="showinfo:5//30000142">Jita</a>';
    expect(rt(src)).toBe(src);
  });

  it('never emits style attributes or unvalidated values', () => {
    const out = rt(
      '<font color="red" style="x" size=99999 onclick=x>a</font><a href=javascript:x>b</a>'
    );
    expect(out).toBe('<font size="64">a</font>b');
  });

  it('escapes text', () => {
    expect(serializeEveMarkup([t('a < b & c')])).toBe('a &lt; b &amp; c');
  });
});

describe('eveMarkupLength', () => {
  it('counts markup, not just text', () => {
    expect(eveMarkupLength('<b>hi</b>')).toBe(9);
    expect(eveMarkupLength(parseEveMarkup('<b>hi</b>'))).toBe(9);
    expect(EVE_MARKUP_LIMIT).toBe(10_000);
  });
});

describe('helpers', () => {
  it('converts an ARGB colour to CSS rgba()', () => {
    expect(markupColorToCss('#80ff0000')).toBe('rgba(255, 0, 0, 0.502)');
  });

  it('splits a tree into lines, re-wrapping formatting on each', () => {
    const lines = splitMarkupLines(parseEveMarkup('<b>a\nb</b>\nc'));
    expect(lines).toEqual([
      [{ type: 'b', children: [t('a')] }],
      [{ type: 'b', children: [t('b')] }],
      [t('c')],
    ]);
  });
});
