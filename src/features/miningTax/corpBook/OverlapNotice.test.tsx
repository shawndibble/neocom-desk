import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { OverlapNotice } from './OverlapNotice';

const setup = (over: Partial<Parameters<typeof OverlapNotice>[0]> = {}) => {
  const onPaidAnotherWay = vi.fn();
  render(
    <OverlapNotice
      corpName="Brass Meridian"
      payeeNames={['Ashfall']}
      paid={false}
      onPaidAnotherWay={onPaidAnotherWay}
      {...over}
    />
  );
  return { onPaidAnotherWay };
};

describe('OverlapNotice', () => {
  it('names the miner Payee and the corporation, and points to Fix my records once the day closes', () => {
    setup();
    expect(screen.getByText(/This ore is also on your list for/).textContent).toBe(
      'This ore is also on your list for Ashfall. Brass Meridian bills it.'
    );
    expect(screen.getByText(/Fix my records puts your records right/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Let the corporation bill it' })).toBeNull();
    expect(screen.getByRole('button', { name: 'I paid it another way' })).toBeTruthy();
  });

  it('says the miner paid it another way', async () => {
    const { onPaidAnotherWay } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'I paid it another way' }));
    expect(onPaidAnotherWay).toHaveBeenCalledOnce();
  });

  it('on a paid entry uses the paid wording', () => {
    setup({ paid: true });
    expect(
      screen.getByText(
        'You marked this paid to Ashfall. Brass Meridian still bills it. If that was the same payment, say so.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I paid it another way' })).toBeTruthy();
  });

  it('never says feeder or Collector', () => {
    setup();
    expect(document.body.textContent).not.toMatch(/feeder|collector/i);
  });
});
