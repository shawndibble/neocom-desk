import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NativeSelect } from './NativeSelect';

describe('NativeSelect', () => {
  it('is a real <select>, so a wrapping <label> still names it', () => {
    render(
      <label>
        Trade Hub
        <NativeSelect defaultValue="jita">
          <option value="jita">Jita</option>
          <option value="amarr">Amarr</option>
        </NativeSelect>
      </label>
    );

    // The caret needs a wrapper element around the <select>; implicit label
    // association survives it because the control is still a descendant.
    expect(screen.getByLabelText('Trade Hub')).toBe(screen.getByRole('combobox'));
  });

  it('selects by option text, the way a native select is driven', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NativeSelect aria-label="Trade Hub" defaultValue="jita" onChange={onChange}>
        <option value="jita">Jita</option>
        <option value="amarr">Amarr</option>
      </NativeSelect>
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Trade Hub' }), 'amarr');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Trade Hub' })).toHaveValue('amarr');
  });

  it('leaves room for its own caret, scaled to the size', () => {
    const { rerender } = render(
      <NativeSelect aria-label="Region">
        <option>Domain</option>
      </NativeSelect>
    );
    // `md`'s caret is the larger glyph and sits further in, so the padding
    // reserved for it has to be the larger one too — the two are set together
    // and this is what catches them drifting apart.
    expect(screen.getByRole('combobox')).toHaveClass('pr-8');

    rerender(
      <NativeSelect size="sm" aria-label="Region">
        <option>Domain</option>
      </NativeSelect>
    );
    expect(screen.getByRole('combobox')).toHaveClass('pr-6');
  });

  it('takes layout classes on the wrapper, not the field', () => {
    render(
      <NativeSelect aria-label="Region" className="w-40">
        <option>Domain</option>
      </NativeSelect>
    );
    const select = screen.getByRole('combobox');
    expect(select).toHaveClass('w-full');
    expect(select.parentElement).toHaveClass('w-40');
  });
});
