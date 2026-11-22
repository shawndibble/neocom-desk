import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { CargoQuantityDialog } from './CargoQuantityDialog';

describe('CargoQuantityDialog', () => {
  it('opens with the quantity focused and selected, so typing replaces it', () => {
    const select = vi.spyOn(HTMLInputElement.prototype, 'select');
    render(
      <CargoQuantityDialog name="EMP S" quantity={250} onClose={vi.fn()} onConfirm={vi.fn()} />
    );
    const field = screen.getByLabelText<HTMLInputElement>('Quantity');
    expect(field).toHaveFocus();
    expect(field.value).toBe('250');
    expect(select.mock.contexts).toContain(field);
    select.mockRestore();
  });

  it('sets the typed quantity', () => {
    const onConfirm = vi.fn();
    render(
      <CargoQuantityDialog name="EMP S" quantity={1} onClose={vi.fn()} onConfirm={onConfirm} />
    );
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set quantity' }));
    expect(onConfirm).toHaveBeenCalledWith(2000);
  });
  it('refuses a blank quantity instead of removing the stack, and says why', () => {
    const onConfirm = vi.fn();
    render(
      <CargoQuantityDialog name="EMP S" quantity={5} onClose={vi.fn()} onConfirm={onConfirm} />
    );
    const field = screen.getByLabelText('Quantity');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set quantity' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('whole number');
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('removes the stack on a deliberate 0', () => {
    const onConfirm = vi.fn();
    render(
      <CargoQuantityDialog name="EMP S" quantity={5} onClose={vi.fn()} onConfirm={onConfirm} />
    );
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set quantity' }));
    expect(onConfirm).toHaveBeenCalledWith(0);
  });
});
