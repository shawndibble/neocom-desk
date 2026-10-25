import '@/i18n';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InlinePercent } from './InlinePercent';

function setup(fraction = 0.5, min = 1, max = 100) {
  const onCommit = vi.fn();
  render(
    <InlinePercent
      fraction={fraction}
      name="Facility yield"
      min={min}
      max={max}
      onCommit={onCommit}
    />
  );
  return onCommit;
}

function openField() {
  fireEvent.click(screen.getByRole('button', { name: /Edit Facility yield/ }));
  return screen.getByRole('textbox', { name: 'Facility yield' });
}

describe('InlinePercent', () => {
  it('shows the value as text until clicked', () => {
    setup(0.545);
    expect(screen.getByRole('button', { name: /54\.5%/ })).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('saves a typed percent as a fraction on Enter', () => {
    const onCommit = setup();
    const field = openField();
    fireEvent.change(field, { target: { value: '54' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(0.54);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('saves on blur', () => {
    const onCommit = setup();
    const field = openField();
    fireEvent.change(field, { target: { value: '52,5' } });
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledWith(0.525);
  });

  it('cancels on Escape', () => {
    const onCommit = setup();
    const field = openField();
    fireEvent.change(field, { target: { value: '60' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('drops an entry outside the bounds or not a number', () => {
    const onCommit = setup(0.5, 1, 100);
    let field = openField();
    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    field = openField();
    fireEvent.change(field, { target: { value: 'abc' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    field = openField();
    fireEvent.change(field, { target: { value: '140' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('allows zero where the bounds do (no tax)', () => {
    const onCommit = setup(0.05, 0, 100);
    const field = openField();
    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(0);
  });

  it('does not save an unchanged value', () => {
    const onCommit = setup(0.5);
    const field = openField();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('opens with a typed digit', () => {
    setup();
    fireEvent.keyDown(screen.getByRole('button', { name: /Edit Facility yield/ }), { key: '5' });
    expect(screen.getByRole('textbox')).toHaveValue('5');
  });
});
