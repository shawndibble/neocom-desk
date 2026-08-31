import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';

function Harness() {
  const [region, setRegion] = useState('the-forge');
  return (
    <Select value={region} onValueChange={setRegion}>
      <SelectTrigger aria-label="Region">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="the-forge">The Forge</SelectItem>
        <SelectItem value="domain">Domain</SelectItem>
        <SelectItem value="heimatar" disabled>
          Heimatar
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

describe('Select', () => {
  it('shows the selected value on the trigger', () => {
    render(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Region' })).toHaveTextContent('The Forge');
  });

  it('opens the listbox on click and lists its options', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Region' }));
    expect(screen.getByRole('option', { name: 'Domain' })).toBeInTheDocument();
  });

  it('selects an option and updates the trigger value', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Region' }));
    await user.click(screen.getByRole('option', { name: 'Domain' }));

    expect(screen.getByRole('combobox', { name: 'Region' })).toHaveTextContent('Domain');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marks a disabled option so it cannot be selected', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Region' }));
    const disabledOption = screen.getByRole('option', { name: 'Heimatar' });
    expect(disabledOption).toHaveAttribute('data-disabled');

    await user.click(disabledOption);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('combobox', { name: 'Region' })).toHaveTextContent('The Forge');
  });

  it('opens with the keyboard and navigates with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Region' });
    trigger.focus();

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('combobox', { name: 'Region' })).toHaveTextContent('Domain');
  });
});
