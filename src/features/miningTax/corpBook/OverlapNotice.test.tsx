import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { OverlapNotice } from './OverlapNotice';

const ZEO = 45490;
const typeNames = new Map([[ZEO, 'Zeolites']]);

const setup = (over: Partial<Parameters<typeof OverlapNotice>[0]> = {}) => {
  const onTakeOver = vi.fn();
  const onPaidAnotherWay = vi.fn();
  render(
    <OverlapNotice
      corpName="Brass Meridian"
      payeeNames={['Ashfall']}
      paid={false}
      previews={[
        {
          payeeName: 'Ashfall',
          before: [{ typeId: ZEO, quantity: 50_000 }],
          after: [{ typeId: ZEO, quantity: 6_950 }],
        },
      ]}
      typeNames={typeNames}
      onTakeOver={onTakeOver}
      onPaidAnotherWay={onPaidAnotherWay}
      {...over}
    />
  );
  return { onTakeOver, onPaidAnotherWay };
};

describe('OverlapNotice', () => {
  it('names the miner Payee and the corporation, and offers both buttons', () => {
    setup();
    expect(screen.getByText(/This ore is also on your list for/).textContent).toBe(
      'This ore is also on your list for Ashfall. Brass Meridian bills it.'
    );
    expect(screen.getByRole('button', { name: 'Let the corporation bill it' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I paid it another way' })).toBeTruthy();
  });

  it('shows before → after first and only takes the ore off after confirming', async () => {
    const { onTakeOver } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Let the corporation bill it' }));
    expect(onTakeOver).not.toHaveBeenCalled();
    expect(screen.getByText(/Ashfall: 50,000 Zeolites → 6,950 Zeolites/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Take it off my list' }));
    expect(onTakeOver).toHaveBeenCalledOnce();
  });

  it('can back out of the preview', async () => {
    const { onTakeOver } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Let the corporation bill it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onTakeOver).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Let the corporation bill it' })).toBeTruthy();
  });

  it('says the miner paid it another way', async () => {
    const { onPaidAnotherWay } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'I paid it another way' }));
    expect(onPaidAnotherWay).toHaveBeenCalledOnce();
  });

  it('on a paid entry offers only the second button, with the paid wording', () => {
    setup({ paid: true });
    expect(
      screen.getByText(
        'You marked this paid to Ashfall. Brass Meridian still bills it. If that was the same payment, say so.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Let the corporation bill it' })).toBeNull();
    expect(screen.getByRole('button', { name: 'I paid it another way' })).toBeTruthy();
  });

  it('never says feeder or Collector', () => {
    setup();
    expect(document.body.textContent).not.toMatch(/feeder|collector/i);
  });
});
