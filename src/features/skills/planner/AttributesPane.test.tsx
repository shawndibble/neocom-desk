import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubViewport } from '@/test/viewport';
import '@/i18n';
import { AttributesPane } from './AttributesPane';
import type { RemapAvailability } from './remapAvailability';

describe('AttributesPane remap availability (#1726)', () => {
  // The remap note is desktop reference; jsdom's default matchMedia is narrow.
  beforeEach(() => {
    stubViewport(() => true);
  });

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

describe('AttributesPane on a phone', () => {
  it('is one line of short labels, with no card and no remap note', () => {
    render(
      <AttributesPane
        result={
          {
            data: { intelligence: 25, memory: 31, perception: 21, willpower: 21, charisma: 21 },
            fetchedAt: new Date(),
            fromCache: false,
            truncated: false,
          } as never
        }
        implantBonuses={{}}
        remapInfo={{ available: 1, bonus: 1, yearlyReady: true, cooldownUntil: null }}
      />
    );
    const region = screen.getByRole('region', { name: 'Attributes' });
    expect(region).toHaveTextContent('INT');
    expect(region).toHaveTextContent('31');
    expect(screen.queryByText(/remap/i)).toBeNull();
  });
});

describe('AttributesPane Optimize queue', () => {
  it('runs on press, on a phone too', async () => {
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
