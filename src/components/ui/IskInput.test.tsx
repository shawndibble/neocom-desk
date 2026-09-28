import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { IskInput } from './IskInput';

function Harness({
  initial = '',
  onCommit,
  echo,
}: {
  initial?: string;
  onCommit: (value: string) => void;
  echo?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <IskInput
        aria-label="Max price"
        value={value}
        echo={echo}
        onChange={(next) => {
          setValue(next);
          onCommit(next);
        }}
      />
      <button type="button" onClick={() => setValue('')}>
        Clear
      </button>
    </>
  );
}

describe('IskInput', () => {
  it('commits "1b" as the plain digit string and echoes the exact figure', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);

    const input = screen.getByRole('textbox', { name: 'Max price' });
    expect(input).toHaveAttribute('inputmode', 'decimal');
    await user.type(input, '1b');

    expect(onCommit).toHaveBeenLastCalledWith('1000000000');
    expect(input).toHaveValue('1b');
    expect(screen.getByText('= 1,000,000,000 ISK')).toBeInTheDocument();
  });

  it('leaves the committed value alone while the text does not parse yet', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);

    await user.type(screen.getByRole('textbox', { name: 'Max price' }), '1.');

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith('1');
    expect(screen.getByRole('textbox', { name: 'Max price' })).toHaveValue('1.');
  });

  it('commits blank as the empty string, so a caller can read it as "use the default"', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness initial="500" onCommit={onCommit} />);

    await user.clear(screen.getByRole('textbox', { name: 'Max price' }));

    expect(onCommit).toHaveBeenLastCalledWith('');
    expect(screen.queryByText(/= .* ISK/)).not.toBeInTheDocument();
  });

  it('shows a default amount as grouped placeholder text while blank', () => {
    render(<IskInput aria-label="Value" value="" defaultAmount={1234567} onChange={() => {}} />);

    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveAttribute(
      'placeholder',
      '1,234,567'
    );
  });

  it('adopts a value changed from outside, replacing what was typed', async () => {
    const user = userEvent.setup();
    render(<Harness onCommit={() => {}} />);

    const input = screen.getByRole('textbox', { name: 'Max price' });
    await user.type(input, '5m');
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(input).toHaveValue('');
  });

  it('omits the echo line when asked, for a fixed-height strip', async () => {
    const user = userEvent.setup();
    render(<Harness onCommit={() => {}} echo={false} />);

    await user.type(screen.getByRole('textbox', { name: 'Max price' }), '1b');

    expect(screen.queryByText('= 1,000,000,000 ISK')).not.toBeInTheDocument();
  });
});
