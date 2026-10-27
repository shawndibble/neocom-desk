import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { CheckboxSelect } from './CheckboxSelect';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', description: 'Second letter' },
  { value: 'c', label: 'Gamma' },
] as const;

function renderSelect(selected: readonly string[], onToggle = vi.fn()) {
  render(
    <CheckboxSelect
      label="Letters"
      options={OPTIONS}
      selected={new Set(selected)}
      onToggle={onToggle}
    />
  );
  return onToggle;
}

describe('CheckboxSelect', () => {
  it.each([
    [['a', 'b', 'c'], 'Letters: All'],
    [[], 'Letters: None'],
    [['b'], 'Letters: Beta'],
    [['a', 'c'], 'Letters: 2 selected'],
  ])('summarises %j on the trigger as "%s"', (selected, text) => {
    renderSelect(selected);
    expect(screen.getByRole('button', { name: text })).toHaveTextContent(text);
  });

  it('ticks the selected options and toggles one without closing the menu', async () => {
    const user = userEvent.setup();
    const onToggle = renderSelect(['a']);
    await user.click(screen.getByRole('button', { name: 'Letters: Alpha' }));

    expect(screen.getByRole('menuitemcheckbox', { name: 'Alpha' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByText('Second letter')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Gamma' }));
    expect(onToggle).toHaveBeenCalledWith('c');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
