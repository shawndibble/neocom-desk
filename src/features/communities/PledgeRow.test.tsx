import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { PledgeRow } from './PledgeRow';

const line = { typeId: 1, name: 'Ishtar Blueprint', quantity: 10, kind: 'bpc' as const };

function setup(over: Partial<Parameters<typeof PledgeRow>[0]> = {}) {
  const onSaveDelivered = vi.fn();
  render(
    <ul>
      <PledgeRow
        line={line}
        spec="BPC, runs 10, ME 10"
        progress={{ needed: 10, pledged: 10, delivered: 0 }}
        own={{ quantity: 10, delivered: 0 }}
        stale={false}
        canPledge
        busy={false}
        onPledge={() => {}}
        onWithdraw={() => {}}
        onSaveDelivered={onSaveDelivered}
        {...over}
      />
    </ul>
  );
  return { onSaveDelivered };
}

describe('PledgeRow delivery', () => {
  it('saves a typed delivered amount', async () => {
    const { onSaveDelivered } = setup({ manualEntry: true });
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Quantity you delivered of Ishtar Blueprint' }),
      '4'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save delivered' }));
    expect(onSaveDelivered).toHaveBeenCalledWith(4);
  });

  it('reads 00 and 000 as 0, which clears the typed amount', async () => {
    const { onSaveDelivered } = setup({
      manualEntry: true,
      own: { quantity: 10, delivered: 4, manual: 4 },
    });
    const field = screen.getByRole('textbox', {
      name: 'Quantity you delivered of Ishtar Blueprint',
    });
    await userEvent.clear(field);
    await userEvent.type(field, '000');
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save delivered' }));
    expect(onSaveDelivered).toHaveBeenCalledWith(0);
  });

  it('refuses more than the Pledge, in words', async () => {
    const { onSaveDelivered } = setup({ manualEntry: true });
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Quantity you delivered of Ishtar Blueprint' }),
      '11'
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 0 up to 10.');
    expect(screen.getByRole('button', { name: 'Save delivered' })).toBeDisabled();
    expect(onSaveDelivered).not.toHaveBeenCalled();
  });

  it('offers no typed amount while contracts can mark delivery', () => {
    setup({ manualEntry: false });
    expect(screen.queryByRole('button', { name: 'Save delivered' })).toBeNull();
  });

  it('marks a typed amount that is what shows as manual, and a contract figure as not', () => {
    setup({ own: { quantity: 10, delivered: 4, manual: 4 } });
    expect(screen.getByText(/You delivered 4 of 10/)).toHaveTextContent('(manual)');
  });

  it('does not call a contract delivery manual even when a smaller typed amount exists', () => {
    setup({ own: { quantity: 10, delivered: 7, manual: 4 } });
    expect(screen.getByText(/You delivered 7 of 10/)).not.toHaveTextContent('manual');
  });

  it('says in words which BPC attribute differs from the ask', () => {
    setup({
      flags: [
        { contractId: 5, attribute: 'runs', asked: 10, got: 5 },
        { contractId: 6, attribute: 'runs', asked: 10, got: 5 },
      ],
    });
    expect(screen.getByText('Counted, but not as asked: runs 5, asked 10.')).toBeInTheDocument();
  });
});
