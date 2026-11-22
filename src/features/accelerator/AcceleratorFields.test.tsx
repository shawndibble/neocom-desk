import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { AcceleratorFields } from './AcceleratorFields';

function Harness({ initial }: { initial: number | null }) {
  const [expiresAt, setExpiresAt] = useState(initial);
  const [bonus, setBonus] = useState(12);
  return (
    <>
      <AcceleratorFields
        bonus={bonus}
        expiresAt={expiresAt}
        onBonusChange={setBonus}
        onExpiresChange={(next) => {
          setExpiresAt(next);
          return true;
        }}
      />
      <button type="button">Elsewhere</button>
    </>
  );
}

const timeText = () => screen.getByRole('button', { name: /^Edit time left/ });

describe('AcceleratorFields once a time is set', () => {
  it('reads as text, and one click on the time opens all three boxes', async () => {
    const user = userEvent.setup();
    render(<Harness initial={Date.now() + 23 * DAY_MS + 2 * HOUR_MS + 4 * MINUTE_MS + 30_000} />);

    expect(timeText()).toHaveTextContent('23d 2h 5m');
    expect(screen.getByRole('button', { name: /^Edit bonus/ })).toHaveTextContent('12');
    expect(screen.queryByRole('textbox')).toBeNull();

    await user.click(timeText());
    expect(screen.getByLabelText('Days')).toHaveFocus();
    expect(screen.getByLabelText('Hours')).toHaveValue('2');
    expect(screen.getByLabelText('Minutes')).toBeInTheDocument();

    // Tabbing between the boxes keeps them open; leaving the group reads as text again.
    await user.tab();
    expect(screen.getByLabelText('Hours')).toHaveFocus();
    await user.clear(screen.getByLabelText('Hours'));
    await user.type(screen.getByLabelText('Hours'), '5');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(timeText()).toHaveTextContent('23d 5h 5m');
  });

  it('keeps the boxes open while typing the first time, then reads as text', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);

    await user.type(screen.getByLabelText('Days'), '1');
    expect(screen.getByLabelText('Days')).toHaveFocus();
    // The rest of the form stays open while the first entry is still being made.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('spinbutton')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(timeText()).toHaveTextContent('1d 0h 0m');
  });

  it('Escape restores the value the field opened with and hands focus back', async () => {
    const user = userEvent.setup();
    render(<Harness initial={Date.now() + DAY_MS + 30_000} />);

    await user.click(screen.getByRole('button', { name: /^Edit bonus/ }));
    const field = screen.getByRole('spinbutton');
    await user.clear(field);
    await user.type(field, '8');
    await user.keyboard('{Escape}');

    const bonus = screen.getByRole('button', { name: /^Edit bonus/ });
    expect(bonus).toHaveTextContent('12');
    expect(bonus).toHaveFocus();
  });
});

describe('AcceleratorFields bonus box', () => {
  it('can be emptied without snapping to the minimum, and shows the bonus again on leaving', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    const field = screen.getByLabelText('Bonus');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    await user.clear(field);
    expect(field).toHaveValue(null);
    await user.type(field, '8');
    expect(field).toHaveValue(8);
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.getByLabelText('Bonus')).toHaveValue(8);
  });
});
