import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { openOrderRow } from './__fixtures__/openOrderRow';
import { OpenOrdersList } from './OpenOrdersList';

describe('OpenOrdersList — turn-in glyph (#6708)', () => {
  it('puts a buy order turn-in glyph beside the card, opening the same detail', async () => {
    const buy = openOrderRow({
      typeName: 'Federation Strategic Intel',
      isBuyOrder: true,
      turnInEach: 60_000,
    });
    const sell = openOrderRow({ orderId: 2, typeName: 'Tritanium', turnInEach: 60_000 });
    // A bid the turn-in does not beat gets no cue.
    const highBid = openOrderRow({
      orderId: 3,
      typeName: 'Stereo-Collapse Signal',
      isBuyOrder: true,
      price: 70_000,
      turnInEach: 60_000,
    });
    const onOpen = vi.fn();
    render(
      <OpenOrdersList
        rows={[buy, sell, highBid]}
        label="Orders"
        highlightId={null}
        onOpen={onOpen}
      />
    );
    const glyphs = screen.getAllByRole('button', { name: /Turn-in reward for/ });
    expect(glyphs).toHaveLength(1);
    await userEvent.click(glyphs[0]);
    expect(onOpen).toHaveBeenCalledWith(buy);
  });
});
