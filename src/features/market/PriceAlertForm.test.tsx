import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';

vi.mock('@/market/prices', () => ({
  getHubPrices: vi.fn(async () => new Map([[34, { sellMin: 5.5 }]])),
}));

const { PriceAlertForm } = await import('./PriceAlertForm');

function renderForm(props: Partial<Parameters<typeof PriceAlertForm>[0]> = {}) {
  const onSave = vi.fn();
  const onClear = vi.fn();
  const onClose = vi.fn();
  render(
    <PriceAlertForm typeId={34} onSave={onSave} onClear={onClear} onClose={onClose} {...props} />
  );
  return { onSave, onClear, onClose };
}

describe('PriceAlertForm', () => {
  it('parses the ISK amount, rounds it and closes on save', () => {
    const { onSave, onClose } = renderForm();
    fireEvent.change(screen.getByLabelText(/Target price/), { target: { value: '1,234.6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ price: 1235, direction: 'above' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows Clear only when a target exists', () => {
    renderForm();
    expect(screen.queryByRole('button', { name: 'Clear alert' })).toBeNull();
  });

  it('clears an existing target', () => {
    const { onClear } = renderForm({ targetPrice: 10, targetDirection: 'below' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear alert' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('names the hub it compares against and its current lowest sell', async () => {
    renderForm();
    expect(screen.getByText(/Compares against lowest sell at Jita/)).toBeTruthy();
    expect(await screen.findByText(/Now 6 ISK|Now 5 ISK/)).toBeTruthy();
  });

  it('announces an error and marks the field invalid instead of saving an empty price', () => {
    const { onSave, onClose } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/Enter a price above 0/);
    const input = screen.getByLabelText(/Target price/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('announces an error for a zero or non-numeric price', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Target price/), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Enter a price above 0/);
  });

  it('clears the error once the price is edited again', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Target price/), { target: { value: '100' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
