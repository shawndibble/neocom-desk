import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { AttributesPane } from './AttributesPane';
import type { RemapAvailability } from './remapAvailability';

describe('AttributesPane remap availability (#1726)', () => {
  it('shows nothing about remaps when there is no ESI attributes data', () => {
    render(<AttributesPane result={null} implantBonuses={{}} remapInfo={null} />);

    expect(screen.queryByText(/remap/i)).toBeNull();
  });

  it('shows live remap availability independent of any open plan', () => {
    const remapInfo: RemapAvailability = {
      available: 2,
      bonus: 1,
      yearlyReady: true,
      cooldownUntil: null,
    };
    render(<AttributesPane result={null} implantBonuses={{}} remapInfo={remapInfo} />);

    expect(screen.getByText('Remaps: 1 bonus now · yearly ready')).toBeInTheDocument();
  });

  it('shows the cooldown date when the yearly remap is not ready yet', () => {
    const remapInfo: RemapAvailability = {
      available: 1,
      bonus: 1,
      yearlyReady: false,
      cooldownUntil: new Date('2027-03-12T00:00:00Z'),
    };
    render(<AttributesPane result={null} implantBonuses={{}} remapInfo={remapInfo} />);

    expect(screen.getByText(/^Remaps: 1 bonus now · yearly from /)).toBeInTheDocument();
  });
});

describe('AttributesPane Optimize queue', () => {
  it('runs on press', async () => {
    const onOptimizeQueue = vi.fn();
    render(
      <AttributesPane
        result={null}
        implantBonuses={{}}
        remapInfo={null}
        onOptimizeQueue={onOptimizeQueue}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Optimize queue' }));
    expect(onOptimizeQueue).toHaveBeenCalledTimes(1);
  });

  it('stays focusable but does nothing when the queue is empty', async () => {
    const onOptimizeQueue = vi.fn();
    render(
      <AttributesPane
        result={null}
        implantBonuses={{}}
        remapInfo={null}
        onOptimizeQueue={onOptimizeQueue}
        queueEmpty
      />
    );
    const button = screen.getByRole('button', { name: 'Optimize queue' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    expect(onOptimizeQueue).not.toHaveBeenCalled();
  });

  it('has no button without a handler', () => {
    render(<AttributesPane result={null} implantBonuses={{}} remapInfo={null} />);
    expect(screen.queryByRole('button', { name: 'Optimize queue' })).toBeNull();
  });
});
