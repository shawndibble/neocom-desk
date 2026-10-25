import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MaxIskInput } from './MovePlanMaxIsk';

function Harness({
  initial,
  onChange,
}: {
  initial: number | null;
  onChange: (v: number | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <MaxIskInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

const field = () => screen.getByRole('textbox', { name: /max isk per haul/i });

describe('MaxIskInput', () => {
  it('is blank, with a No limit hint, when nothing is saved', () => {
    render(<Harness initial={null} onChange={vi.fn()} />);
    expect((field() as HTMLInputElement).value).toBe('');
    expect((field() as HTMLInputElement).placeholder).toBe('No limit');
  });

  it('shows the saved limit', () => {
    render(<Harness initial={2_500_000_000} onChange={vi.fn()} />);
    expect((field() as HTMLInputElement).value).toMatch(/2.500.000.000/);
  });

  it('reports a typed number, and null once cleared', async () => {
    const onChange = vi.fn();
    render(<Harness initial={null} onChange={onChange} />);
    await userEvent.type(field(), '500');
    expect(onChange).toHaveBeenLastCalledWith(500);
    await userEvent.clear(field());
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('flags zero and garbage, and never reads them as no limit', async () => {
    const onChange = vi.fn();
    render(<Harness initial={null} onChange={onChange} />);
    await userEvent.type(field(), '0');
    expect(screen.getByText('Enter a number above 0.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
