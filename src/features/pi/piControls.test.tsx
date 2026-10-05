import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { PercentInput } from './piControls';

function setup(commitOn: 'change' | 'blur') {
  const onCommit = vi.fn();
  render(<PercentInput value={6} commitOn={commitOn} aria-label="Rate" onCommit={onCommit} />);
  return { onCommit, field: screen.getByRole('textbox', { name: 'Rate' }) };
}

describe('PercentInput', () => {
  it('says so when a typed rate is out of range, rather than keeping a shorter prefix silently', () => {
    const { onCommit, field } = setup('change');
    fireEvent.change(field, { target: { value: '15' } });
    fireEvent.change(field, { target: { value: '150' } });
    expect(onCommit).toHaveBeenLastCalledWith(15);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter 0 to 100.')).toBeInTheDocument();
  });

  it('reads a comma as the decimal separator', () => {
    const { onCommit, field } = setup('blur');
    fireEvent.change(field, { target: { value: '12,5' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledWith(12.5);
  });

  it('commits on Enter, and rejects garbage visibly', () => {
    const { onCommit, field } = setup('blur');
    fireEvent.change(field, { target: { value: 'abc' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('drops the error with the typed text once the box reverts on blur', () => {
    const { field } = setup('blur');
    fireEvent.change(field, { target: { value: '150' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    fireEvent.blur(field);
    expect(field).toHaveValue('6');
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Enter 0 to 100.')).not.toBeInTheDocument();
  });
});
