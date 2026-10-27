import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { docToMarkup, markupToDoc, type EditorDoc } from '@/engine/mail/mailEditorDoc';
import { mailEditorExtensions } from './extensions';

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

function make(markup = ''): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: mailEditorExtensions(),
    content: markupToDoc(markup),
  });
  return editor;
}
const markupOf = (ed: Editor) => docToMarkup(ed.getJSON() as EditorDoc);

describe('mail editor schema', () => {
  it('round-trips markup through the live editor', () => {
    const src = '<b>a</b> <font size="16">big</font>\n| h | i |\n|---|---|\n| 1 | 2 |';
    expect(markupOf(make(src))).toBe(src);
  });

  it('does not turn typed markdown into formatting', () => {
    const ed = make('**x*');
    ed.commands.focus('end');
    const { view } = ed;
    const pos = view.state.selection.from;
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, pos, pos, '*', () => view.state.tr)
    );
    expect(handled).toBeFalsy();
    view.dispatch(view.state.tr.insertText('*', pos));
    expect(markupOf(ed)).toBe('**x**');
  });

  it('applies colour and size as marks that replace each other', () => {
    const ed = make('hello');
    ed.commands.selectAll();
    ed.chain().setMark('eveColor', { color: '#ffff0000' }).setMark('eveSize', { px: 16 }).run();
    ed.chain().setMark('eveColor', { color: '#ff00ff00' }).run();
    expect(markupOf(ed)).toBe('<font size="16"><font color="#ff00ff00">hello</font></font>');
    ed.chain().unsetMark('eveColor').unsetMark('eveSize').run();
    expect(markupOf(ed)).toBe('hello');
  });

  it('strips formatting with clear formatting', () => {
    const ed = make('<b>a <i>b</i></b> <a href="https://x.example/">l</a>');
    ed.commands.selectAll();
    ed.commands.unsetAllMarks();
    expect(markupOf(ed)).toBe('a b l');
  });

  it('keeps pasted HTML to the safe subset', () => {
    const ed = make('');
    ed.commands.insertContent(
      '<h1>T</h1><p><strong>b</strong> <img src="x" onerror="x()"> <script>x</script>' +
        '<span style="color:red;font-size:40px">s</span> <a href="javascript:alert(1)">j</a> ' +
        '<a href="https://ok.example/">ok</a> <code>c</code></p><ul><li>item</li></ul>'
    );
    const out = markupOf(ed);
    expect(out).toContain('<b>b</b>');
    expect(out).toContain('<a href="https://ok.example/">ok</a>');
    expect(out).not.toMatch(/script|img|javascript|<h1|<ul|<li|<code|style|red|40/);
  });

  it('holds only plain text in table cells', () => {
    const ed = make('| a | b |\n|---|---|\n| 1 | 2 |');
    ed.commands.selectAll();
    ed.commands.setMark('bold');
    expect(markupOf(ed)).toBe('| a | b |\n|---|---|\n| 1 | 2 |');
  });

  it('escapes literal < & > typed into the text', () => {
    const ed = make('');
    ed.commands.insertContent({ type: 'text', text: 'a <b> & c' });
    expect(markupOf(ed)).toBe('a &lt;b&gt; &amp; c');
  });

  it('clear formatting over a table selection leaves the table intact', () => {
    const ed = make('<b>intro</b>\n| a | b |\n|---|---|\n| 1 | 2 |');
    ed.commands.selectAll();
    ed.commands.unsetAllMarks();
    expect(markupOf(ed)).toBe('intro\n| a | b |\n|---|---|\n| 1 | 2 |');
  });
});
