import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { firstConnected, useFocusAfterCommit } from './useFocusAfterCommit';

const row = (id: string) => () => document.querySelector<HTMLElement>(`[data-row="${id}"]`);

function Harness() {
  const focusAfterCommit = useFocusAfterCommit();
  const [rows, setRows] = useState(['a', 'b']);
  const [late, setLate] = useState(false);
  return (
    <div>
      <h2 data-testid="heading">Heading</h2>
      <button
        onClick={() => {
          focusAfterCommit(row('b'), row('a'));
          setRows(['b']);
        }}
      >
        remove-a
      </button>
      <button onClick={() => focusAfterCommit(row('a'), row('b'))}>request-first</button>
      <button onClick={() => focusAfterCommit(row('none'), row('none'))}>request-none</button>
      <button onClick={() => focusAfterCommit(row('late'))}>request-late</button>
      <button onClick={() => setLate(true)}>show-late</button>
      <input aria-label="other" />
      {rows.map((r) => (
        <button key={r} data-row={r}>
          {r}
        </button>
      ))}
      {late && <button data-row="late">late</button>}
    </div>
  );
}

describe('useFocusAfterCommit', () => {
  it('focuses a candidate that mounts in the same update', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('remove-a'));
    expect(document.activeElement).toBe(row('b')());
  });

  it('prefers the first connected candidate over later ones', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('request-first'));
    expect(document.activeElement).toBe(row('a')());
  });

  it('makes a heading candidate programmatically focusable', async () => {
    const user = userEvent.setup();
    function HeadingHarness() {
      const focusAfterCommit = useFocusAfterCommit();
      return (
        <>
          <h2 data-testid="h">Title</h2>
          <button onClick={() => focusAfterCommit(row('none'), () => document.querySelector('h2'))}>
            go
          </button>
        </>
      );
    }
    render(<HeadingHarness />);
    await user.click(screen.getByText('go'));
    const heading = screen.getByTestId('h');
    expect(heading.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(heading);
  });

  it('does nothing, without throwing, when no candidate is connected', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByText('request-none');
    await user.click(button);
    expect(document.activeElement).toBe(button);
  });

  it('focuses a candidate that connects one commit later', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('request-late'));
    expect(row('late')()).toBeNull();
    // Show it without a focusin (a programmatic click, as an async update would be).
    await act(async () => {
      screen.getByText('show-late').click();
    });
    expect(document.activeElement).toBe(row('late')());
  });

  it('drops a pending request once the user focuses something else', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('request-late'));
    await user.click(screen.getByLabelText('other'));
    await act(async () => {
      screen.getByText('show-late').click();
    });
    expect(document.activeElement).toBe(screen.getByLabelText('other'));
  });
});

describe('firstConnected', () => {
  it('resolves getters and refs, skipping disconnected and empty candidates', () => {
    const attached = document.createElement('button');
    document.body.append(attached);
    const detached = document.createElement('button');
    expect(
      firstConnected([null, detached, { current: null }, () => null, { current: attached }])
    ).toBe(attached);
    expect(firstConnected([() => attached])).toBe(attached);
    expect(firstConnected([detached])).toBeNull();
    attached.remove();
  });
});
