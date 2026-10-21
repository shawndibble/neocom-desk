import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { StockTargetCell } from './StockTargetCell';

function setup(target: number | undefined) {
  const onChange = vi.fn();
  const onRemove = vi.fn();
  render(
    <StockTargetCell itemName="Tritanium" target={target} onChange={onChange} onRemove={onRemove} />
  );
  return { onChange, onRemove };
}

describe('StockTargetCell', () => {
  it('shows a dim dash when there is no target, and the target when there is one', () => {
    setup(undefined);
    expect(
      screen.getByRole('button', { name: 'Set a stock target for Tritanium' })
    ).toHaveTextContent('—');
  });

  it('shows the target grouped', () => {
    setup(12000);
    expect(
      screen.getByRole('button', { name: /Stock target for Tritanium: 12000/ })
    ).toHaveTextContent('12,000');
  });

  it('opens on click and saves on Enter', async () => {
    const { onChange } = setup(undefined);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.type(
      screen.getByRole('spinbutton', { name: 'Target for Tritanium' }),
      '500{Enter}'
    );
    expect(onChange).toHaveBeenCalledWith(500);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('opens from the keyboard', async () => {
    setup(10);
    screen.getByRole('button').focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('spinbutton')).toHaveValue(10);
  });

  it('saves on blur', async () => {
    const { onChange } = setup(10);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.clear(screen.getByRole('spinbutton'));
    await userEvent.type(screen.getByRole('spinbutton'), '25');
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it('cancels on Escape without saving', async () => {
    const { onChange, onRemove } = setup(10);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.type(screen.getByRole('spinbutton'), '9{Escape}');
    expect(onChange).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveTextContent('10');
  });

  it('removes the target when emptied', async () => {
    const { onRemove } = setup(10);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.clear(screen.getByRole('spinbutton'));
    await userEvent.keyboard('{Enter}');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty field when there was no target', async () => {
    const { onChange, onRemove } = setup(undefined);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('keeps the field open and says why for a negative number', async () => {
    const { onChange } = setup(undefined);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.type(screen.getByRole('spinbutton'), '-5{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/whole number/);
  });

  it.each(['0.5', '0'])('shows a visible message and keeps the target for %s', async (text) => {
    const { onChange, onRemove } = setup(10);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.clear(screen.getByRole('spinbutton'));
    await userEvent.type(screen.getByRole('spinbutton'), `${text}{Enter}`);
    expect(onChange).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('alert')).not.toHaveClass('sr-only');
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('does not pull focus back when Tab leaves the field', async () => {
    render(
      <>
        <StockTargetCell itemName="A" target={1} onChange={vi.fn()} onRemove={vi.fn()} />
        <button type="button">next</button>
      </>
    );
    await userEvent.click(screen.getByRole('button', { name: /Stock target for A/ }));
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'next' })).toHaveFocus();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(screen.getByRole('button', { name: 'next' })).toHaveFocus();
  });

  it('lets a click on cell B take over from an open cell A', async () => {
    const onA = vi.fn();
    render(
      <>
        <StockTargetCell itemName="A" target={1} onChange={onA} onRemove={vi.fn()} />
        <StockTargetCell itemName="B" target={2} onChange={vi.fn()} onRemove={vi.fn()} />
      </>
    );
    await userEvent.click(screen.getByRole('button', { name: /Stock target for A/ }));
    await userEvent.click(screen.getByRole('button', { name: /Stock target for B/ }));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(screen.getByRole('spinbutton', { name: 'Target for B' })).toHaveFocus();
    expect(screen.queryByRole('spinbutton', { name: 'Target for A' })).not.toBeInTheDocument();
  });

  it('returns focus to the cell after Enter', async () => {
    setup(10);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.keyboard('{Enter}');
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(screen.getByRole('button')).toHaveFocus();
  });

  it('treats unparsable text ("1e", reported by the browser as empty) as invalid, not as a removal', async () => {
    const { onChange, onRemove } = setup(10);
    await userEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('spinbutton');
    // jsdom does not model badInput; a browser sets it for text a number field cannot parse.
    Object.defineProperty(input, 'validity', { value: { badInput: true } });
    fireEvent.change(input, { target: { value: '' } });
    await userEvent.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeVisible();
  });
});
