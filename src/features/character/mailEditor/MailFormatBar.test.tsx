import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { emptyFormatState, type FormatState } from '@/engine/mailFormat';
import { keyboardInset } from '@/lib/useVisualViewportBox';
import type { MailEditorCommands } from './commands';
import { readFileSync } from 'node:fs';
import footerSource from '../MailComposeFooter.tsx?raw';
import { DOCKED_BAR_SPACE_CLASS, MailFormatBar } from './MailFormatBar';

function commands(state: Partial<FormatState> = {}, over: Partial<MailEditorCommands> = {}) {
  const c: MailEditorCommands = {
    state: { ...emptyFormatState, ...state },
    canClear: true,
    canReset: true,
    toggleMark: vi.fn(),
    setColor: vi.fn(),
    setSize: vi.fn(),
    setLink: vi.fn(),
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

  it('applies an http(s) link, refuses other schemes, and removes an existing one', async () => {
    const c = commands({ link: 'https://old.example/' });
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} phone dock="inline" visible />);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText('Web address');
    expect(field).toHaveValue('https://old.example/');
    await user.clear(field);
    await user.type(field, 'javascript:alert(1){Enter}');
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    expect(c.setLink).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, 'example.com/x{Enter}');
    expect(c.setLink).toHaveBeenCalledWith('https://example.com/x');
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await user.click(await screen.findByRole('button', { name: 'Remove link' }));
    expect(c.setLink).toHaveBeenLastCalledWith(null);
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

describe('docked bar contract with the pinned footer', () => {
  const bar = (dock: 'keyboard' | 'inline', visible: boolean) => (
    <MailFormatBar commands={commands()} phone dock={dock} visible={visible} keyboardInset={300} />
  );

  it('marks itself docked only when fixed above the keyboard and shown', () => {
    const { rerender } = render(bar('keyboard', true));
    expect(screen.getByRole('toolbar')).toHaveAttribute('data-mail-format-bar', 'docked');
    rerender(bar('inline', true));
    expect(screen.getByRole('toolbar')).not.toHaveAttribute('data-mail-format-bar');
    rerender(bar('keyboard', false));
    expect(screen.getByRole('toolbar', { hidden: true })).not.toHaveAttribute(
      'data-mail-format-bar'
    );
  });

  // Read from disk: the CSS pipeline stubs a `?raw` import of a stylesheet to ''.
  const indexCss = readFileSync('src/styles/index.css', 'utf-8');

  it('has a stylesheet rule that lifts the footer, from the same variable as the editor reserve', () => {
    expect(indexCss).toMatch(
      /\.mail-pane:has\(\[data-mail-format-bar='docked'\]\) \.mail-footer\s*\{\s*margin-bottom: var\(--mail-format-bar-space\);/
    );
    expect(indexCss).toContain('--mail-format-bar-space:');
    expect(DOCKED_BAR_SPACE_CLASS).toBe('pb-(--mail-format-bar-space)');
    // The footer carries the class the rule targets, as a whole literal token.
    expect(footerSource).toContain("'mail-footer ");
  });
});
