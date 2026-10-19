import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { emptyFormatState, type FormatState } from '@/engine/mail/mailFormat';
import type { MailEditorCommands } from './commands';
import { MailFormatBar } from './MailFormatBar';

function commands(state: Partial<FormatState> = {}, over: Partial<MailEditorCommands> = {}) {
  const c: MailEditorCommands = {
    state: { ...emptyFormatState, ...state },
    canClear: true,
    canLink: true,
    canReset: true,
    toggleMark: vi.fn(),
    setColor: vi.fn(),
    setSize: vi.fn(),
    linkTarget: () => ({ from: 0, to: 0, text: '', href: null }),
    setLink: vi.fn(),
    removeLink: vi.fn(),
    insertTable: vi.fn(),
    clearFormatting: vi.fn(),
    ...over,
  };
  return c;
}

describe('MailFormatBar', () => {
  it('reflects the active state with aria-pressed', () => {
    render(
      <MailFormatBar
        commands={commands({ bold: true, link: 'https://a.example/' })}
        phone={false}
      />
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Link' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles marks and never takes focus from the editor', async () => {
    const c = commands();
    render(<MailFormatBar commands={c} phone={false} />);
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(fireEvent.pointerDown(bold)).toBe(false); // default prevented
    expect(fireEvent.mouseDown(bold)).toBe(false);
    await userEvent.setup().click(bold);
    expect(c.toggleMark).toHaveBeenCalledWith('bold');
  });

  it('disables clear formatting with a reason in Source', async () => {
    render(<MailFormatBar commands={commands({}, { canClear: false })} phone={false} />);
    const clear = screen.getByRole('button', { name: 'Clear formatting' });
    expect(clear).toHaveAttribute('aria-disabled', 'true');
    const user = userEvent.setup();
    await user.click(clear);
    clear.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Not available in Source view');
  });

  it('applies a swatch, always opaque', async () => {
    const c = commands();
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone />);
    await user.click(screen.getByRole('button', { name: 'Text colour' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Colour ff5555' }));
    expect(c.setColor).toHaveBeenCalledWith('#ffff5555');
  });

  it('takes a custom hex as opaque and rejects junk', async () => {
    const c = commands();
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone />);
    await user.click(screen.getByRole('button', { name: 'Text colour' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText('Custom colour (hex)');
    await user.type(field, 'zzz{Enter}');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('3 or 6 digit');
    expect(c.setColor).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, '#F80{Enter}');
    expect(c.setColor).toHaveBeenCalledWith('#ffff8800');
  });

  it('picks a size preset, normal clears the size', async () => {
    const c = commands();
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone />);
    await user.click(screen.getByRole('button', { name: 'Text size' }));
    await user.click(await screen.findByRole('button', { name: 'Large' }));
    expect(c.setSize).toHaveBeenCalledWith(16);
    await user.click(screen.getByRole('button', { name: 'Text size' }));
    await user.click(await screen.findByRole('button', { name: 'Normal' }));
    expect(c.setSize).toHaveBeenLastCalledWith(null);
  });

  it('prefills both fields from the link under the caret and applies edits to both', async () => {
    const c = commands(
      { link: 'https://old.example/' },
      { linkTarget: () => ({ from: 1, to: 4, text: 'old', href: 'https://old.example/' }) }
    );
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone />);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog');
    const text = within(dialog).getByLabelText('Text');
    const url = within(dialog).getByLabelText('Web address');
    expect(text).toHaveValue('old');
    expect(url).toHaveValue('https://old.example/');
    expect(url).toHaveFocus();
    await user.clear(text);
    await user.type(text, 'new');
    await user.clear(url);
    await user.type(url, 'example.com/x{Enter}');
    expect(c.setLink).toHaveBeenCalledWith(expect.objectContaining({ from: 1, to: 4 }), {
      text: 'new',
      href: 'https://example.com/x',
    });
  });

  it('prefills the selected text, focuses Text for a bare caret, and refuses other schemes', async () => {
    const c = commands({}, { linkTarget: () => ({ from: 1, to: 3, text: 'hi', href: null }) });
    const user = userEvent.setup();
    const { unmount } = render(<MailFormatBar commands={c} phone />);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Text')).toHaveValue('hi');
    expect(within(dialog).getByLabelText('Web address')).toHaveFocus();
    expect(within(dialog).queryByRole('button', { name: 'Remove link' })).toBeNull();
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'showinfo:1377//1']) {
      await user.clear(within(dialog).getByLabelText('Web address'));
      await user.type(within(dialog).getByLabelText('Web address'), `${bad}{Enter}`);
      expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    }
    expect(c.setLink).not.toHaveBeenCalled();
    unmount();

    const caret = commands();
    render(<MailFormatBar commands={caret} phone />);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Text')).toHaveValue('');
    expect(within(dialog).getByLabelText('Text')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Web address'), 'example.com{Enter}');
    expect(caret.setLink).toHaveBeenCalledWith(expect.anything(), {
      text: 'https://example.com',
      href: 'https://example.com',
    });
  });

  it('rejects over-long text, and removes an existing link', async () => {
    const c = commands(
      {},
      { linkTarget: () => ({ from: 1, to: 4, text: 'old', href: 'https://old.example/' }) }
    );
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone />);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Text'), { target: { value: 'a'.repeat(201) } });
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('under 200');
    expect(c.setLink).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Remove link' }));
    expect(c.removeLink).toHaveBeenCalledWith(expect.objectContaining({ from: 1, to: 4 }));
  });

  it('leaves an over-long prefilled selection alone and links it by address', async () => {
    const long = 'a'.repeat(300);
    const c = commands({}, { linkTarget: () => ({ from: 1, to: 301, text: long, href: null }) });
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone />);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Web address'), 'example.com{Enter}');
    expect(c.setLink).toHaveBeenCalledWith(expect.anything(), {
      text: long,
      href: 'https://example.com',
    });
  });

  it('locks Text when the selection spans blocks, applying the link to the address only', async () => {
    const c = commands(
      {},
      { linkTarget: () => ({ from: 1, to: 9, text: '', href: null, markOnly: true }) }
    );
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone />);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Text')).toBeDisabled();
    expect(within(dialog).getByText(/spans paragraphs/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Web address'), 'example.com{Enter}');
    expect(c.setLink).toHaveBeenCalledWith(expect.objectContaining({ markOnly: true }), {
      text: 'https://example.com',
      href: 'https://example.com',
    });
  });

  it('inserts a table of the chosen size', async () => {
    const c = commands();
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone />);
    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'More rows' }));
    await user.click(within(dialog).getByRole('button', { name: 'Insert table' }));
    expect(c.insertTable).toHaveBeenCalledWith(4, 3);
  });
});

describe('MailFormatBar placement and Source', () => {
  // The bar is the card's top strip on a phone too, never `fixed`: inside the
  // reader Panel (`backdrop-filter`) a fixed bar was placed against the Panel.
  it('is shown in the flow on a phone, with no editor focus', () => {
    render(<MailFormatBar commands={commands()} phone />);
    const bar = screen.getByRole('toolbar');
    expect(bar).toBeVisible();
    expect(bar.className).not.toMatch(/(^|\s)fixed(\s|$)/);
  });

  it('disables the "back to default" controls where they would do nothing', async () => {
    const user = userEvent.setup();
    render(<MailFormatBar commands={commands({}, { canReset: false })} phone />);
    await user.click(screen.getByRole('button', { name: 'Text colour' }));
    expect(await screen.findByRole('button', { name: 'Default colour' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Text size' }));
    expect(await screen.findByRole('button', { name: 'Normal' })).toBeDisabled();
  });
});

describe('bar structure', () => {
  it('is borderless, grouped by three hairlines, with Source pinned outside the scroller', () => {
    const { container } = render(
      <MailFormatBar
        commands={commands()}
        phone
        sourceActive={false}
        onToggleSource={() => undefined}
      />
    );
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold.className).not.toMatch(/(^|\s)border(\s|$)/);
    const toolbar = screen.getByRole('toolbar');
    // Three dividers between the four groups inside the scroller, one before the pinned Source.
    const scroller = bold.closest('.overflow-x-auto') as HTMLElement;
    expect(scroller.querySelectorAll('span[aria-hidden].w-px')).toHaveLength(3);
    const source = screen.getByRole('button', { name: 'Edit source' });
    expect(scroller.contains(source)).toBe(false);
    expect(toolbar.contains(source)).toBe(true);
    expect(container).toBeTruthy();
  });

  it('keeps the Link click a no-op and explains why while it is aria-disabled', async () => {
    const c = commands({}, { canLink: false });
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone={false} />);
    const link = screen.getByRole('button', { name: 'Link' });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    await user.click(link);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    link.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent("can't carry a link");
  });
});
