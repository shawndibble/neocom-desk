import '@/i18n';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InputCostMoveLine } from './InputCostMoveLine';

describe('InputCostMoveLine', () => {
  it('names the input, its share and the product move; warns when cost rose and product did not', () => {
    render(
      <InputCostMoveLine
        move={{ costPct: 9, topInput: { typeID: 34, sharePct: 38.2 }, productPct: 0 }}
        inputName="Tritanium"
      />
    );
    const line = screen.getByText(/Build cost \+9% in 7d \(Tritanium is 38% of cost\)/);
    expect(line.textContent).toContain('product 0%');
    expect(line.className).toContain('text-warning');
  });

  it('stays muted when the product rose too, and drops the product part without history', () => {
    const { rerender } = render(
      <InputCostMoveLine
        move={{ costPct: 9, topInput: { typeID: 34, sharePct: 50 }, productPct: 4 }}
        inputName="Tritanium"
      />
    );
    expect(screen.getByText(/product \+4%/).className).toContain('text-text-dim');
    rerender(
      <InputCostMoveLine
        move={{ costPct: -9, topInput: { typeID: 34, sharePct: 50 }, productPct: null }}
        inputName="Tritanium"
      />
    );
    expect(screen.getByText(/Build cost −9%/).textContent).not.toContain('product');
  });
});
