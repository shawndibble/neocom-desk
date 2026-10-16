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
        docked={false}
      />
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Link' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles marks and never takes focus from the editor', async () => {
    const c = commands();
    render(<MailFormatBar commands={c} docked={false} />);
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(fireEvent.pointerDown(bold)).toBe(false); // default prevented
    expect(fireEvent.mouseDown(bold)).toBe(false);
    await userEvent.setup().click(bold);
    expect(c.toggleMark).toHaveBeenCalledWith('bold');
  });

  it('disables clear formatting with a reason in Source', () => {
    render(<MailFormatBar commands={commands({}, { canClear: false })} docked={false} />);
    expect(screen.getByRole('button', { name: 'Clear formatting' })).toBeDisabled();
  });

  it('applies a swatch, always opaque', async () => {
    const c = commands();
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} docked />);
    await user.click(screen.getByRole('button', { name: 'Text colour' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Colour ff5555' }));
    expect(c.setColor).toHaveBeenCalledWith('#ffff5555');
  });

  it('takes a custom hex as opaque and rejects junk', async () => {
    const c = commands();
    const user = userEvent.setup();
    render(<MailFormatBar commands={c} docked />);
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
    render(<MailFormatBar commands={c} docked />);
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
    render(<MailFormatBar commands={c} docked />);
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
    render(<MailFormatBar commands={c} docked />);
    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'More rows' }));
    await user.click(within(dialog).getByRole('button', { name: 'Insert table' }));
    expect(c.insertTable).toHaveBeenCalledWith(4, 3);
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
