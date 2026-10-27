import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Field, Fields } from './Fields';
import { Slider } from './Slider';

describe('Slider', () => {
  it('is a named slider carrying min, max, step and its value text', () => {
    render(
      <Slider aria-label="Range" min={0} max={10} step={0.5} value={4} valueText="4 km" readOnly />
    );
    const slider = screen.getByRole('slider', { name: 'Range' });
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '10');
    expect(slider).toHaveAttribute('step', '0.5');
    expect(slider).toHaveValue('4');
    expect(slider).toHaveAttribute('aria-valuetext', '4 km');
  });

  it('reports a change and merges a caller className', () => {
    const onChange = vi.fn();
    render(<Slider aria-label="Range" className="w-40" defaultValue={2} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Range' });
    expect(slider).toHaveClass('accent-accent', 'w-40');
    fireEvent.change(slider, { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(slider).toHaveValue('7');
  });

  it('forwards disabled and ref', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Slider aria-label="Range" disabled ref={ref} />);
    const slider = screen.getByRole('slider', { name: 'Range' });
    expect(slider).toBeDisabled();
    expect(ref.current).toBe(slider);
  });

  it("is described by its Field's note", () => {
    render(
      <Fields>
        <Field label="Range" note="Drag to set">
          <Slider aria-label="Range" />
        </Field>
      </Fields>
    );
    expect(screen.getByRole('slider', { name: 'Range' })).toHaveAccessibleDescription(
      'Drag to set'
    );
  });
});
