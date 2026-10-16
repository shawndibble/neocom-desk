import { useState } from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import RichMailBodyEditor from './RichMailBodyEditor';

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
    expect(pm.parentElement?.parentElement?.className).toContain('bg-[#0a0e14]');
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
    await user.click(screen.getByRole('button', { name: 'Source' }));
    const src = screen.getByRole('textbox', { name: 'Message source (EVE markup)' });
    expect(src).toHaveValue('<b>hi</b>');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect((await editor()).querySelector('strong')?.textContent).toBe('hi');
  });

  it('emits only the safe subset from Source and says what it dropped', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<Harness onValue={seen} />);
    await editor();
    await user.click(screen.getByRole('button', { name: 'Source' }));
    const src = screen.getByRole('textbox', { name: 'Message source (EVE markup)' });
    fireEvent.change(src, { target: { value: 'a<script>x</script><b>b</b> < c' } });
    expect(seen).toHaveBeenLastCalledWith('ax<b>b</b> &lt; c');
    expect(screen.getByTestId('value')).toHaveTextContent('ax<b>b</b> &lt; c');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('status')).toHaveTextContent("EVE can't show it");
  });

  it('wraps the Source selection in tags from the format bar', async () => {
    const user = userEvent.setup();
    render(<Harness initial="hello world" />);
    await editor();
    await user.click(screen.getByRole('button', { name: 'Source' }));
    const src = screen.getByRole('textbox', { name: 'Message source (EVE markup)' });
    (src as HTMLTextAreaElement).setSelectionRange(6, 11);
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(src).toHaveValue('hello <b>world</b>');
    expect(screen.getByRole('button', { name: 'Clear formatting' })).toBeDisabled();
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
});
