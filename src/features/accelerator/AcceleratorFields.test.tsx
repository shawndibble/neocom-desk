import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { instantToInputValue } from '@/lib/zonedInput';
import { AcceleratorFields } from './AcceleratorFields';

const HOUR = 3_600_000;

async function renderInEndTimeMode(expiresAt: number | null) {
  const onExpiresChange = vi.fn<(expiresAt: number | null) => boolean>(() => true);
  render(
    <AcceleratorFields
      bonus={10}
      expiresAt={expiresAt}
      onBonusChange={() => {}}
      onExpiresChange={onExpiresChange}
    />
  );
  await userEvent.click(screen.getByRole('button', { name: 'Enter end time instead' }));
  return { onExpiresChange, input: screen.getByLabelText('Ends at') as HTMLInputElement };
}

describe('AcceleratorFields end time', () => {
  it('does not save an end time that has already passed, and keeps what was typed', async () => {
    const live = Date.now() + 5 * HOUR;
    const { onExpiresChange, input } = await renderInEndTimeMode(live);
    // A datetime-local fires per segment: typing the year passes through 0020.
    const partial = instantToInputValue(live, undefined).replace(/^\d{4}/, '0020');
    fireEvent.change(input, { target: { value: partial } });

    expect(onExpiresChange).not.toHaveBeenCalled();
    expect(input.value).toBe(partial);
    expect(screen.getByText('That time has already passed.')).toBeInTheDocument();
    // Leaving the box keeps it, so the pilot sees what didn't apply.
    fireEvent.blur(input);
    expect(input.value).toBe(partial);
  });

  it('saves a future end time', async () => {
    const { onExpiresChange, input } = await renderInEndTimeMode(null);
    const future = Date.now() + 3 * HOUR;
    const value = instantToInputValue(future, undefined);
    fireEvent.change(input, { target: { value } });

    expect(onExpiresChange).toHaveBeenCalledTimes(1);
    expect(instantToInputValue(onExpiresChange.mock.calls[0]![0]!, undefined)).toBe(value);
    expect(screen.queryByText('That time has already passed.')).not.toBeInTheDocument();
  });
});
