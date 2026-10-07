import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { MapAdviceState } from './useMapAdvice';

let state: MapAdviceState = { status: 'loading' };
vi.mock('./useMapAdvice', () => ({ useMapAdvice: () => state }));
vi.mock('./PlanMap', () => ({ PlanMap: () => <p>map board</p> }));

const { PiMapTab } = await import('./PiMapTab');

const ready = (esiFailed: { retry: () => void; retrying: boolean } | null, pricesFailed = false) =>
  ({ status: 'ready', colonies: [], esiFailed, pricesFailed }) as unknown as MapAdviceState;

describe('PiMapTab when hub prices could not be read', () => {
  it('keeps the board and adds the notice', () => {
    state = ready(null, true);
    render(<PiMapTab characterId={7} />);
    expect(screen.getByText('Hub prices could not be fetched')).toBeInTheDocument();
    expect(screen.getByText('map board')).toBeInTheDocument();
  });

  it('shows no price notice when prices loaded', () => {
    state = ready(null);
    render(<PiMapTab characterId={7} />);
    expect(screen.queryByText('Hub prices could not be fetched')).not.toBeInTheDocument();
  });
});

describe('PiMapTab when ESI does not answer the colony read', () => {
  it('draws the board for a pilot with no colonies, plus the notice', () => {
    state = ready({ retry: () => {}, retrying: false });
    render(<PiMapTab characterId={7} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/ESI didn't answer/);
    expect(screen.getByText('map board')).toBeInTheDocument();
  });

  it('shows no notice when the read worked', () => {
    state = ready(null);
    render(<PiMapTab characterId={7} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('map board')).toBeInTheDocument();
  });

  it('moves focus to the board after a successful Retry', async () => {
    const retry = vi.fn();
    state = ready({ retry, retrying: false });
    const { rerender } = render(<PiMapTab characterId={7} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
    state = ready({ retry, retrying: true });
    rerender(<PiMapTab characterId={7} />);
    state = ready(null);
    rerender(<PiMapTab characterId={7} />);
    await waitFor(() =>
      expect(document.activeElement).toContainElement(screen.getByText('map board'))
    );
    expect(document.activeElement).not.toBe(document.body);
  });
});
