import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRetryFocus } from './useRetryFocus';

type Read = 'busy' | 'failed' | 'ok';

/** PI layout: Retry is a sibling outside the wrapper, which exists only in the ok state. */
function Sibling({ read, resetKey = 'a' }: { read: Read; resetKey?: string }) {
  const [ref, arm] = useRetryFocus(read, resetKey);
  return (
    <>
      {read !== 'ok' && (
        <button onClick={arm} data-testid="retry">
          Retry
        </button>
      )}
      {read === 'ok' && (
        <div ref={ref} tabIndex={-1} data-testid="result">
          result
        </div>
      )}
    </>
  );
}

/** Pilot Lookup layout: the whole failed branch, Retry included, unmounts while loading. */
function Unmounting({ read }: { read: Read }) {
  const [ref, arm] = useRetryFocus<HTMLElement>(read, 'a');
  return (
    <section ref={ref} tabIndex={-1} data-testid="wrapper">
      {read === 'failed' && (
        <button onClick={arm} data-testid="retry">
          Retry
        </button>
      )}
    </section>
  );
}

function press(id: string) {
  const el = screen.getByTestId(id);
  el.focus();
  act(() => el.click());
}

describe('useRetryFocus', () => {
  it('focuses the wrapper when an armed read succeeds', () => {
    const { rerender } = render(<Sibling read="failed" />);
    press('retry');
    rerender(<Sibling read="busy" />);
    rerender(<Sibling read="ok" />);
    expect(screen.getByTestId('result')).toHaveFocus();
  });

  it('leaves focus on Retry that is still mounted after a repeat failure', () => {
    const { rerender } = render(<Sibling read="failed" />);
    press('retry');
    rerender(<Sibling read="busy" />);
    rerender(<Sibling read="failed" />);
    expect(screen.getByTestId('retry')).toHaveFocus();
  });

  it('focuses the wrapper after a repeat failure when Retry unmounted', () => {
    const { rerender } = render(<Unmounting read="failed" />);
    press('retry');
    rerender(<Unmounting read="busy" />);
    expect(document.body).toHaveFocus();
    rerender(<Unmounting read="failed" />);
    expect(screen.getByTestId('wrapper')).toHaveFocus();
  });

  it('holds focus on the wrapper from the click when Retry unmounts', () => {
    function Held({ read }: { read: 'busy' | 'failed' | 'ok' }) {
      const [ref, , hold] = useRetryFocus<HTMLDivElement>(read, 'a');
      return (
        <div ref={ref} tabIndex={-1} data-testid="wrapper">
          {read === 'failed' && (
            <button onClick={hold} data-testid="retry">
              Retry
            </button>
          )}
        </div>
      );
    }
    const { rerender } = render(<Held read="failed" />);
    press('retry');
    rerender(<Held read="busy" />);
    expect(screen.getByTestId('wrapper')).toHaveFocus();
  });

  it('drops a pending retry when resetKey changes', () => {
    const { rerender } = render(<Sibling read="failed" resetKey="a" />);
    press('retry');
    rerender(<Sibling read="busy" resetKey="b" />);
    rerender(<Sibling read="ok" resetKey="b" />);
    expect(screen.getByTestId('result')).not.toHaveFocus();
  });

  it('moves nothing when never armed', () => {
    const { rerender } = render(<Sibling read="busy" />);
    rerender(<Sibling read="ok" />);
    expect(screen.getByTestId('result')).not.toHaveFocus();
  });
});
