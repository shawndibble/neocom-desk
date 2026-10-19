import { describe, expect, it } from 'vitest';
import { classifyMarkupLink } from './eveMarkup';
import {
  droppedMarkup,
  docToMarkup,
  markupToDoc,
  plainTextToMarkup,
  sanitizeMarkup,
  type EditorDoc,
  type EditorNode,
} from './mailEditorDoc';

const para = (...content: EditorNode[]): EditorNode => ({
  type: 'paragraph',
  content,
});

describe('markupToDoc', () => {
  it('makes one empty paragraph of nothing', () => {
    expect(markupToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
  it('turns marks into editor marks, one paragraph per line', () => {
    const doc = markupToDoc(
      'hi <b>there</b>\n<font color="#ffff0000"><font size="16">x</font></font>'
    );
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content).toEqual([
      { type: 'text', text: 'hi ' },
      { type: 'text', text: 'there', marks: [{ type: 'bold' }] },
    ]);
    expect(doc.content[1].content?.[0].marks).toEqual(
      expect.arrayContaining([
        { type: 'eveColor', attrs: { color: '#ffff0000' } },
        { type: 'eveSize', attrs: { px: 16 } },
      ])
    );
  });
  it('turns pipe rows into a table with a header row, plus a trailing paragraph', () => {
    const doc = markupToDoc('intro\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(doc.content.map((n) => n.type)).toEqual(['paragraph', 'table', 'paragraph']);
    const rows = doc.content[1].content!;
    expect(rows[0].content!.map((c) => c.type)).toEqual(['tableHeader', 'tableHeader']);
    expect(rows[1].content!.map((c) => c.type)).toEqual(['tableCell', 'tableCell']);
    expect(rows[1].content![0].content).toEqual([{ type: 'text', text: '1' }]);
  });
  it('leaves space-aligned columns as prose', () => {
    expect(markupToDoc('a  b  c\n1  2  3').content.map((n) => n.type)).toEqual([
      'paragraph',
      'paragraph',
    ]);
  });
});

describe('docToMarkup', () => {
  it('writes nothing for the empty doc: no wrapper tag, no newline', () => {
    expect(docToMarkup(markupToDoc(''))).toBe('');
  });
  it('escapes literal < & > as entities, never tags', () => {
    const doc: EditorDoc = {
      type: 'doc',
      content: [para({ type: 'text', text: 'a <b> & c > d' })],
    };
    expect(docToMarkup(doc)).toBe('a &lt;b&gt; &amp; c &gt; d');
  });
  it('keeps typed markdown literal', () => {
    const doc: EditorDoc = { type: 'doc', content: [para({ type: 'text', text: '**x** | y' })] };
    expect(docToMarkup(doc)).toBe('**x** | y');
  });
  it('merges neighbouring runs that share formatting', () => {
    const b = [{ type: 'bold' }];
    const doc: EditorDoc = {
      type: 'doc',
      content: [
        para(
          { type: 'text', text: 'ab', marks: b },
          { type: 'text', text: 'cd', marks: [...b, { type: 'italic' }] }
        ),
      ],
    };
    expect(docToMarkup(doc)).toBe('<b>ab<i>cd</i></b>');
  });
  it('drops a link whose href is not allowed', () => {
    const doc: EditorDoc = {
      type: 'doc',
      content: [
        para({
          type: 'text',
          text: 'x',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        }),
      ],
    };
    expect(docToMarkup(doc)).toBe('x');
  });
  it('serialises a table as pipe rows and drops the empty paragraph after it', () => {
    const src = 'intro\n| a | b |\n|---|---|\n| 1 | 2 |';
    expect(docToMarkup(markupToDoc(src))).toBe(src);
  });
  it('treats a hard break as a newline', () => {
    const doc: EditorDoc = {
      type: 'doc',
      content: [
        para({ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }),
      ],
    };
    expect(docToMarkup(doc)).toBe('a\nb');
  });
});

describe('round trip', () => {
  it.each([
    'plain',
    'a\n\nb\n',
    '<b>bold</b> and <i>it</i> and <u>under</u>',
    '<font color="#ffff0000">red</font> <font size="24">big</font>',
    '<a href="https://example.com/?a=1&amp;b=2">link</a>',
    '<a href="showinfo:1373//90000001">Pilot</a>',
    '<b>x <i>y</i></b>',
    'less &lt; more &amp; &gt;',
    'intro\n| a | b |\n|---|---|\n| 1 | 2 |\noutro',
  ])('is stable for %j', (src) => {
    const once = docToMarkup(markupToDoc(src));
    expect(once).toBe(sanitizeMarkup(src));
    expect(docToMarkup(markupToDoc(once))).toBe(once);
  });
});

describe('sanitizeMarkup', () => {
  it('drops tags outside the safe subset', () => {
    expect(sanitizeMarkup('a<script>x</script><b>b</b>')).toBe('ax<b>b</b>');
  });
});

describe('plainTextToMarkup', () => {
  it('escapes a legacy plain draft so tags in it stay literal', () => {
    expect(plainTextToMarkup('if a < b && <b>x</b>')).toBe(
      'if a &lt; b &amp;&amp; &lt;b&gt;x&lt;/b&gt;'
    );
    expect(docToMarkup(markupToDoc(plainTextToMarkup('<b>x</b> & y')))).toBe(
      '&lt;b&gt;x&lt;/b&gt; &amp; y'
    );
  });
});

describe('droppedMarkup', () => {
  it('flags markup the safe subset removes, not markup it keeps', () => {
    expect(droppedMarkup('<b>ok</b> <script>x</script>')).toBe(true);
    expect(droppedMarkup('<b></b>')).toBe(true);
    expect(droppedMarkup('<b>ok</b> <font color="#ffff0000">red</font>')).toBe(false);
    expect(droppedMarkup('no tags, a < b')).toBe(false);
  });
});

describe('entity escaping stays single through the table and Source round trips', () => {
  it('a literal &amp; typed in a table cell is escaped once and reloads unchanged', () => {
    const doc: EditorDoc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'text', text: '&amp;' }] },
                { type: 'tableHeader', content: [{ type: 'text', text: 'b' }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'text', text: '<' }] },
                { type: 'tableCell', content: [{ type: 'text', text: 'x' }] },
              ],
            },
          ],
        },
        { type: 'paragraph' },
      ],
    };
    const once = docToMarkup(doc);
    expect(once).toBe('| &amp;amp; | b |\n|---|---|\n| &lt; | x |');
    expect(docToMarkup(markupToDoc(once))).toBe(once);
    expect(docToMarkup(markupToDoc(docToMarkup(markupToDoc(once))))).toBe(once);
  });

  it('Source -> Preview -> draft reload keeps `&amp;` single-escaped', () => {
    const source = '| a &amp; b | c |\n|---|---|\n| 1 | 2 |';
    const sent = sanitizeMarkup(source);
    expect(sent).toBe(source);
    expect(docToMarkup(markupToDoc(sent))).toBe(source);
    expect(markupToDoc(sent).content[0].content?.[0].content?.[0].content).toEqual([
      { type: 'text', text: 'a & b' },
    ]);
  });
});

describe('links', () => {
  it('rejects javascript: hrefs at the classifier and drops them from the tree', () => {
    expect(classifyMarkupLink('javascript:alert(1)')).toBeNull();
    expect(sanitizeMarkup('<a href="javascript:alert(1)">x</a>')).toBe('x');
  });
});
