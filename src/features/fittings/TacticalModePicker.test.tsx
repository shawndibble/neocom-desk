import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting } from '@/engine/fittings/types';
import { TacticalModePicker } from './TacticalModePicker';

const NAMES: Record<number, string> = {
  34564: 'Svipul Defense Mode',
  34566: 'Svipul Propulsion Mode',
  34570: 'Svipul Sharpshooter Mode',
};
const typeName = (typeId: number) => NAMES[typeId] ?? `#${typeId}`;
const svipul: Fitting = { name: 'Svipul', shipTypeId: 34562, modules: [], drones: [], cargo: [] };

describe('TacticalModePicker', () => {
  it('shows the Defense Mode until another is picked, and edits the Fitting to the pick', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TacticalModePicker fitting={svipul} onChange={onChange} typeName={typeName} />);
    const trigger = screen.getByRole('combobox', { name: 'Tactical mode' });
    expect(trigger).toHaveTextContent('Svipul Defense Mode');

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Svipul Sharpshooter Mode' }));
    const change = onChange.mock.calls[0][0] as (f: Fitting) => Fitting;
    expect(change(svipul).mode).toBe(34570);
  });

  it('picking the default mode clears it, so the Share Link stays in the old format', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TacticalModePicker
        fitting={{ ...svipul, mode: 34570 }}
        onChange={onChange}
        typeName={typeName}
      />
    );
    await user.click(screen.getByRole('combobox', { name: 'Tactical mode' }));
    await user.click(await screen.findByRole('option', { name: 'Svipul Defense Mode' }));
    const change = onChange.mock.calls[0][0] as (f: Fitting) => Fitting;
    expect(change({ ...svipul, mode: 34570 })).not.toHaveProperty('mode');
  });

  it('is not there for a hull without modes', () => {
    const { container } = render(
      <TacticalModePicker
        fitting={{ ...svipul, shipTypeId: 587 }}
        onChange={vi.fn()}
        typeName={typeName}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
