import { StrictMode, useState } from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import RichMailBodyEditor from './RichMailBodyEditor';

// jsdom has no layout: ProseMirror's scroll-into-view asks a Range for its rects.
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

// ...and no hit testing: ProseMirror's mousedown handler calls posAtCoords.
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

function Harness({ initial = '', onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <RichMailBodyEditor
        id="body"
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue?.(v);
        }}
      />
      <pre data-testid="value">{value}</pre>
    </>
  );
}

function firstText(el: Node): Node {
  const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
  if (!node) throw new Error('no text node');
  return node;
}

async function editor() {
  return waitFor(() => {
    const el = document.querySelector('.ProseMirror');
    if (!el) throw new Error('editor not mounted');
    return el as HTMLElement;
  });
}

describe('RichMailBodyEditor', () => {
  it('shows the initial markup formatted, on the dark mail surface', async () => {
    render(<Harness initial={'plain <b>bold</b> <font color="#ffff0000">red</font>'} />);
    const pm = await editor();
    expect(pm.querySelector('strong')?.textContent).toBe('bold');
    expect(pm.querySelector('[data-eve-color="#ffff0000"]')?.textContent).toBe('red');
    expect(pm.closest('[data-mail-card]')?.className).toContain('bg-[#0a0e14]');
  });

  it('renders a pipe table as a real table', async () => {
    render(<Harness initial={'| a | b |\n|---|---|\n| 1 | 2 |'} />);
    const pm = await editor();
    expect(pm.querySelectorAll('table tr')).toHaveLength(2);
    expect(pm.querySelectorAll('th')).toHaveLength(2);
  });

  it('switches to Source showing the exact markup, and back', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'<b>hi</b>'} />);
    await editor();
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    const src = screen.getByRole('textbox', { name: 'Message source (EVE markup)' });
    expect(src).toHaveValue('<b>hi</b>');
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    expect((await editor()).querySelector('strong')?.textContent).toBe('hi');
  });

  it('emits only the safe subset from Source and says what it dropped', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<Harness onValue={seen} />);
    await editor();
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    const src = screen.getByRole('textbox', { name: 'Message source (EVE markup)' });
    fireEvent.change(src, { target: { value: 'a<script>x</script><b>b</b> < c' } });
    expect(seen).toHaveBeenLastCalledWith('ax<b>b</b> &lt; c');
    expect(screen.getByTestId('value')).toHaveTextContent('ax<b>b</b> &lt; c');
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    expect(screen.getByRole('status')).toHaveTextContent("EVE can't show it");
  });

  it('wraps the Source selection in tags from the format bar', async () => {
    const user = userEvent.setup();
    render(<Harness initial="hello world" />);
    await editor();
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    const src = screen.getByRole('textbox', { name: 'Message source (EVE markup)' });
    (src as HTMLTextAreaElement).setSelectionRange(6, 11);
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(src).toHaveValue('hello <b>world</b>');
    expect(screen.getByRole('button', { name: 'Clear formatting' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('inserts a table from the dialog and emits pipe rows', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await editor();
    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Insert table' }));
    await waitFor(() =>
      expect(document.querySelector('.ProseMirror')?.querySelectorAll('tr')).toHaveLength(3)
    );
    expect(screen.getByTestId('value').textContent).toBe(
      '|  |  |  |\n|---|---|---|\n|  |  |  |\n|  |  |  |'
    );
  });

  it('replaces the content when the value changes from outside', async () => {
    const { rerender } = render(
      <RichMailBodyEditor id="b" value="one" onChange={() => undefined} />
    );
    await editor();
    rerender(<RichMailBodyEditor id="b" value="<i>two</i>" onChange={() => undefined} />);
    await waitFor(() => expect(document.querySelector('.ProseMirror em')?.textContent).toBe('two'));
  });

  it('keeps exactly one element with the id, the visible control, in both views', async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="body">Message</label>
        <Harness initial="hi" />
      </>
    );
    const pm = await editor();
    await waitFor(() => expect(pm).toHaveAttribute('id', 'body'));
    expect(document.querySelectorAll('#body')).toHaveLength(1);
    await user.click(screen.getByText('Message'));
    await waitFor(() => expect(pm).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    expect(document.querySelectorAll('#body')).toHaveLength(1);
    expect(document.getElementById('body')).toBe(
      screen.getByRole('textbox', { name: 'Message source (EVE markup)' })
    );
    await user.click(screen.getByText('Message'));
    expect(document.getElementById('body')).toHaveFocus();
  });

  it('warns while Source holds markup that will be removed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await editor();
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    const src = screen.getByRole('textbox', { name: 'Message source (EVE markup)' });
    fireEvent.change(src, { target: { value: 'a<script>x</script>' } });
    expect(screen.getByRole('status')).toHaveTextContent('will be removed');
  });

  it('converts a pasted markdown pipe table, and nothing else markdown', async () => {
    render(<Harness />);
    const pm = await editor();
    const paste = (text: string) =>
      fireEvent.paste(pm, {
        clipboardData: {
          getData: (t: string) => (t === 'text/plain' ? text : ''),
          types: ['text/plain'],
        },
      });
    paste('| a | b |\n|---|---|\n| 1 | 2 |');
    await waitFor(() => expect(pm.querySelectorAll('tr')).toHaveLength(2));
    expect(screen.getByTestId('value').textContent).toBe('| a | b |\n|---|---|\n| 1 | 2 |');
  });

  it('never shows a bar button as pressed or a no-op reset control in Source', async () => {
    const user = userEvent.setup();
    render(<Harness initial="x" />);
    await editor();
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    await user.click(screen.getByRole('textbox', { name: 'Message source (EVE markup)' }));
    await user.click(screen.getByRole('button', { name: 'Text colour' }));
    expect(await screen.findByRole('button', { name: 'Default colour' })).toBeDisabled();
  });

  it('Source: inserts an escaped tag over the selection, and replaces a whole selected tag', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<Harness initial="say hi now" onValue={seen} />);
    await editor();
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    const src = screen.getByRole('textbox', { name: 'Message source (EVE markup)' });
    (src as HTMLTextAreaElement).setSelectionRange(4, 6);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Text')).toHaveValue('hi');
    await user.type(within(dialog).getByLabelText('Web address'), 'example.com{Enter}');
    expect(src).toHaveValue('say <a href="https://example.com">hi</a> now');
    expect(seen).toHaveBeenLastCalledWith('say <a href="https://example.com">hi</a> now');

    (src as HTMLTextAreaElement).setSelectionRange(
      4,
      4 + '<a href="https://example.com">hi</a>'.length
    );
    await user.click(screen.getByRole('button', { name: 'Link' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Web address')).toHaveValue('https://example.com');
    await user.clear(within(dialog).getByLabelText('Text'));
    await user.type(within(dialog).getByLabelText('Text'), 'a <b> & c{Enter}');
    expect(src).toHaveValue('say <a href="https://example.com">a &lt;b&gt; &amp; c</a> now');
  });

  it('Preview: rewrites the text and address of the link under the caret, keeping bold', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'x <b><a href="https://old.example/">old</a></b> y'} />);
    const pm = await editor();
    const anchor = pm.querySelector('a')!;
    await user.click(pm);
    const sel = window.getSelection()!;
    sel.setBaseAndExtent(firstText(anchor), 1, firstText(anchor), 1);
    fireEvent(document, new Event('selectionchange'));
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText('Text')).toHaveValue('old'));
    expect(within(dialog).getByLabelText('Web address')).toHaveValue('https://old.example/');
    await user.clear(within(dialog).getByLabelText('Text'));
    await user.type(within(dialog).getByLabelText('Text'), 'fresh');
    await user.clear(within(dialog).getByLabelText('Web address'));
    await user.type(within(dialog).getByLabelText('Web address'), 'https://new.example/{Enter}');
    await waitFor(() =>
      expect(screen.getByTestId('value').textContent).toBe(
        'x <a href="https://new.example/"><b>fresh</b></a> y'
      )
    );
  });

  async function selectIn(
    pm: HTMLElement,
    user: ReturnType<typeof userEvent.setup>,
    a: [Node, number],
    b: [Node, number]
  ) {
    await user.click(pm);
    window.getSelection()!.setBaseAndExtent(a[0], a[1], b[0], b[1]);
    fireEvent(document, new Event('selectionchange'));
  }

  it('Preview: a caret at the edge of a link starts a new link; one inside edits it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'a <a href="https://o.example/">old</a> b'} />);
    const pm = await editor();
    const text = firstText(pm.querySelector('a')!);
    for (const [offset, edit] of [
      [0, false],
      [3, false],
      [1, true],
    ] as const) {
      await selectIn(pm, user, [text, offset], [text, offset]);
      await user.click(screen.getByRole('button', { name: 'Link' }));
      const dialog = await screen.findByRole('dialog');
      await waitFor(() =>
        expect(within(dialog).getByLabelText('Text')).toHaveValue(edit ? 'old' : '')
      );
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
  });

  it('Preview: a selection across two paragraphs only gains the link mark', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'one\ntwo'} />);
    const pm = await editor();
    const ps = pm.querySelectorAll('p');
    expect(ps).toHaveLength(2);
    await selectIn(pm, user, [firstText(ps[0]), 1], [firstText(ps[1]), 2]);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Text')).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Web address'), 'example.com{Enter}');
    await waitFor(() => expect(pm.querySelectorAll('p')).toHaveLength(2));
    expect(pm.querySelectorAll('a')).toHaveLength(2);
    expect(pm.textContent).toBe('onetwo');
  });

  it('Preview: Link is disabled with a reason inside a table cell', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'| a | bcd |\n|---|---|\n| 1 | 2 |'} />);
    const pm = await editor();
    const cell = firstText(pm.querySelectorAll('th')[1]);
    await selectIn(pm, user, [cell, 1], [cell, 3]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Link' })).toHaveAttribute('aria-disabled', 'true')
    );
  });

  it('has no Preview/Source SegmentedControl; one pressed-state toggle switches modes', async () => {
    const user = userEvent.setup();
    render(<Harness initial="x" />);
    await editor();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Edit source' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // The bar is inside the one card, with the writing surface.
    const card = document.querySelector('[data-mail-card]') as HTMLElement;
    expect(within(card).getByRole('toolbar')).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Message source (EVE markup)' })).toHaveClass(
      'font-mono'
    );
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the bar and toggle available after switching to Source, and back', async () => {
    const user = userEvent.setup();
    render(<Harness initial="x" />);
    await editor();
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    const src = screen.getByRole('textbox', { name: 'Message source (EVE markup)' });
    expect(src).toHaveFocus();
    expect(screen.getByRole('toolbar')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    expect(screen.getByRole('toolbar')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit source' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await waitFor(() => expect(document.querySelector('.ProseMirror')).toHaveFocus());
  });

  it('mounts under StrictMode and survives a value change from outside', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <StrictMode>
        <RichMailBodyEditor id="body" value="<b>one</b>" onChange={() => undefined} />
      </StrictMode>
    );
    const pm = await editor();
    expect(pm.querySelector('strong')?.textContent).toBe('one');
    expect(pm).not.toHaveFocus();
    rerender(
      <StrictMode>
        <RichMailBodyEditor id="body" value="two" onChange={() => undefined} />
      </StrictMode>
    );
    await waitFor(() => expect(pm.textContent).toBe('two'));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('puts the counter inside the card', async () => {
    render(
      <RichMailBodyEditor
        id="body"
        value="x"
        onChange={() => undefined}
        counter={<span>1 / 10000</span>}
      />
    );
    await editor();
    const card = document.querySelector('[data-mail-card]') as HTMLElement;
    const counter = within(card).getByText('1 / 10000');
    expect(counter.parentElement).toHaveClass('justify-end');
    expect(card.lastElementChild).toBe(counter.parentElement);
  });
});
