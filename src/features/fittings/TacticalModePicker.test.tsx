import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { tacticalModeHulls, tacticalModesFor } from '@/engine/fittings/tacticalModes';
import type { Fitting } from '@/engine/fittings/types';
import { TacticalModePicker } from './TacticalModePicker';

const svipul: Fitting = { name: 'Svipul', shipTypeId: 34562, modules: [], drones: [], cargo: [] };

describe('TacticalModePicker', () => {
  it('shows the Defense Mode until another is picked, and edits the Fitting to the pick', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TacticalModePicker fitting={svipul} onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Tactical mode' });
    expect(trigger).toHaveTextContent('Defense Mode');

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Sharpshooter Mode' }));
    const change = onChange.mock.calls[0][0] as (f: Fitting) => Fitting;
    expect(change(svipul).mode).toBe(34570);
  });

  it('picking the default mode clears it, so the Share Link stays in the old format', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TacticalModePicker fitting={{ ...svipul, mode: 34570 }} onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Tactical mode' }));
    await user.click(await screen.findByRole('option', { name: 'Defense Mode' }));
    const change = onChange.mock.calls[0][0] as (f: Fitting) => Fitting;
    expect(change({ ...svipul, mode: 34570 })).not.toHaveProperty('mode');
  });

  it('names every mode of every hull with modes, never as a bare type id', async () => {
    const user = userEvent.setup();
    for (const hull of tacticalModeHulls()) {
      const { unmount } = render(
        <TacticalModePicker fitting={{ ...svipul, shipTypeId: hull }} onChange={vi.fn()} />
      );
      await user.click(screen.getByRole('combobox', { name: 'Tactical mode' }));
      const options = await screen.findAllByRole('option');
      expect(options).toHaveLength(tacticalModesFor(hull).length);
      for (const option of options) {
        expect(option).toHaveTextContent(
          /(Defense|Propulsion|Sharpshooter|Primary|Secondary|Tertiary) Mode$/
        );
        expect(option.textContent).not.toMatch(/#[0-9]/);
      }
      unmount();
    }
  });

  it('is not there for a hull without modes', () => {
    const { container } = render(
      <TacticalModePicker fitting={{ ...svipul, shipTypeId: 587 }} onChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
