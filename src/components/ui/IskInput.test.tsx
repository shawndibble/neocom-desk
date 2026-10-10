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
    expect(screen.getByRole('textbox', { name: 'Max price' })).toHaveAttribute(
      'aria-invalid',
      'true'
    );
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

describe('IskInput description', () => {
  it('describes the field by the echo, only while there is one', async () => {
    const user = userEvent.setup();
    render(<Harness onCommit={vi.fn()} />);
    const input = screen.getByLabelText('Max price');
    expect(input).not.toHaveAttribute('aria-describedby');
    await user.type(input, '1b');
    expect(input).toHaveAccessibleDescription('= 1,000,000,000 ISK');
  });
});

describe('IskInput invalid text', () => {
  it('never errors while "1.5b" is typed, even at "1."', async () => {
    const user = userEvent.setup();
    render(<Harness onCommit={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Max price' }), '1.5b');
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('holds a trailing "." until blur', async () => {
    const user = userEvent.setup();
    render(<Harness onCommit={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Max price' }), '1.');
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent('Not an ISK amount');
  });

  it('shows the error after a pause, describes the field by it, and clears when fixed', async () => {
    const user = userEvent.setup();
    render(<Harness onCommit={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: 'Max price' });
    await user.type(input, 'abc');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Not an ISK amount');
    expect(input).toHaveAccessibleDescription(/Not an ISK amount/);
    await user.clear(input);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.type(input, '1b');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('= 1,000,000,000 ISK')).toBeInTheDocument();
  });

  it('shows the error on blur at once, even with the echo off', async () => {
    const user = userEvent.setup();
    render(<Harness onCommit={vi.fn()} echo={false} />);
    await user.type(screen.getByRole('textbox', { name: 'Max price' }), '1x');
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent('Not an ISK amount');
  });
});
