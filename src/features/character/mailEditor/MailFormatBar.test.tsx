import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { emptyFormatState, type FormatState } from '@/engine/mailFormat';
import { keyboardInset } from '@/lib/useVisualViewportBox';
import type { MailEditorCommands } from './commands';
import { MailFormatBar } from './MailFormatBar';

function commands(state: Partial<FormatState> = {}, over: Partial<MailEditorCommands> = {}) {
  const c: MailEditorCommands = {
    state: { ...emptyFormatState, ...state },
    canClear: true,
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
        dock="inline"
        visible
      />
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Link' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles marks and never takes focus from the editor', async () => {
    const c = commands();
    render(<MailFormatBar commands={c} phone={false} dock="inline" visible />);
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(fireEvent.pointerDown(bold)).toBe(false); // default prevented
    expect(fireEvent.mouseDown(bold)).toBe(false);
    await userEvent.setup().click(bold);
    expect(c.toggleMark).toHaveBeenCalledWith('bold');
  });

  it('disables clear formatting with a reason in Source', () => {
    render(
      <MailFormatBar
        commands={commands({}, { canClear: false })}
        phone={false}
        dock="inline"
        visible
      />
    );
    expect(screen.getByRole('button', { name: 'Clear formatting' })).toBeDisabled();
  });

  it('applies a swatch, always opaque', async () => {
    const c = commands();
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone dock="inline" visible />);
    await user.click(screen.getByRole('button', { name: 'Text colour' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Colour ff5555' }));
    expect(c.setColor).toHaveBeenCalledWith('#ffff5555');
  });

  it('takes a custom hex as opaque and rejects junk', async () => {
    const c = commands();
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone dock="inline" visible />);
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
    render(<MailFormatBar commands={c} phone dock="inline" visible />);
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
    render(<MailFormatBar commands={c} phone dock="inline" visible />);
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
    expect(c.setLink).toHaveBeenCalledWith({ text: 'new', href: 'https://example.com/x' });
  });

  it('prefills the selected text, focuses Text for a bare caret, and refuses other schemes', async () => {
    const c = commands({}, { linkTarget: () => ({ from: 1, to: 3, text: 'hi', href: null }) });
    const user = userEvent.setup();
    const { unmount } = render(<MailFormatBar commands={c} phone dock="inline" visible />);
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
    render(<MailFormatBar commands={caret} phone dock="inline" visible />);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Text')).toHaveValue('');
    expect(within(dialog).getByLabelText('Text')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Web address'), 'example.com{Enter}');
    expect(caret.setLink).toHaveBeenCalledWith({
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
    render(<MailFormatBar commands={c} phone dock="inline" visible />);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Text'), { target: { value: 'a'.repeat(201) } });
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('under 200');
    expect(c.setLink).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Remove link' }));
    expect(c.removeLink).toHaveBeenCalled();
  });

  it('inserts a table of the chosen size', async () => {
    const c = commands();
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone dock="inline" visible />);
    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'More rows' }));
    await user.click(within(dialog).getByRole('button', { name: 'Insert table' }));
    expect(c.insertTable).toHaveBeenCalledWith(4, 3);
  });
});

describe('MailFormatBar placement and Source', () => {
  it('is hidden until the editor has focus, but a hidden bar stays mounted for its sheets', () => {
    render(<MailFormatBar commands={commands()} phone dock="inline" visible={false} />);
    expect(screen.getByRole('toolbar', { hidden: true })).toHaveClass('hidden');
  });

  it('docks at the keyboard inset', () => {
    render(
      <MailFormatBar commands={commands()} phone dock="keyboard" visible keyboardInset={310} />
    );
    expect(screen.getByRole('toolbar')).toHaveStyle({ bottom: '310px' });
  });

  it('disables the "back to default" controls where they would do nothing', async () => {
    const user = userEvent.setup();
    render(
      <MailFormatBar commands={commands({}, { canReset: false })} phone dock="inline" visible />
    );
    await user.click(screen.getByRole('button', { name: 'Text colour' }));
    expect(await screen.findByRole('button', { name: 'Default colour' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Text size' }));
    expect(await screen.findByRole('button', { name: 'Normal' })).toBeDisabled();
  });
});

describe('keyboardInset', () => {
  it('is how much the keyboard covers of the layout viewport', () => {
    expect(keyboardInset(800, { height: 500, offsetTop: 0 })).toBe(300);
    expect(keyboardInset(800, { height: 500, offsetTop: 40 })).toBe(260);
    expect(keyboardInset(800, { height: 800, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(800, null)).toBe(0);
  });
});
