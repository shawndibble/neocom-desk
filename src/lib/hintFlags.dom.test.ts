import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
  claimSessionHint,
  dismissSessionHint,
  releaseSessionHint,
  resetSessionHints,
  useHintCounts,
  useOneTimeHint,
  useSessionHintShown,
} from './hintFlags';

beforeEach(() => {
  useHintCounts.setState({ value: {}, hydrated: true });
  resetSessionHints();
});

describe('useSessionHintShown', () => {
  it('shows for the holder until the session hint is dismissed, which spends it for its type', () => {
    const { result } = renderHook(() => useSessionHintShown('goTo'));
    expect(result.current).toBe(false);

    act(() => void claimSessionHint('goTo'));
    expect(result.current).toBe(true);

    act(() => dismissSessionHint('rowHint:x'));
    expect(result.current).toBe(true);
    act(() => dismissSessionHint('goTo'));
    expect(result.current).toBe(false);
    expect(claimSessionHint('goTo:other')).toBe(false);
    expect(claimSessionHint('rowHint')).toBe(true);
  });
});

describe('releaseSessionHint', () => {
  it('frees an unanswered hint for another owner, never a dismissed one', () => {
    claimSessionHint('rowHint:a');
    releaseSessionHint('rowHint:a');
    expect(claimSessionHint('rowHint:b')).toBe(true);

    dismissSessionHint('rowHint:b');
    releaseSessionHint('rowHint:b');
    expect(claimSessionHint('rowHint:c')).toBe(false);
  });
});

describe('useOneTimeHint', () => {
  it('shows one hint at a time, the next after Got it', () => {
    const row = renderHook(() => useOneTimeHint('rowHint'));
    const picker = renderHook(() => useOneTimeHint('columnPickerHint'));
    expect(row.result.current[0]).toBe(true);
    expect(picker.result.current[0]).toBe(false);

    act(() => row.result.current[1]());
    expect(row.result.current[0]).toBe(false);
    expect(picker.result.current[0]).toBe(true);
  });

  it('lets an inactive hint block nothing', () => {
    const hidden = renderHook(() => useOneTimeHint('rowHint', false));
    const picker = renderHook(() => useOneTimeHint('columnPickerHint'));
    expect(hidden.result.current[0]).toBe(false);
    expect(picker.result.current[0]).toBe(true);
  });

  it('frees the turn when the shown hint unmounts unanswered', () => {
    const row = renderHook(() => useOneTimeHint('rowHint'));
    const picker = renderHook(() => useOneTimeHint('columnPickerHint'));
    expect(picker.result.current[0]).toBe(false);
    row.unmount();
    expect(picker.result.current[0]).toBe(true);
  });

  it('is never held back by the Go to tag', () => {
    claimSessionHint('goTo');
    const row = renderHook(() => useOneTimeHint('rowHint'));
    expect(row.result.current[0]).toBe(true);
  });
});

describe('useOneTimeHint on a hidden anchor', () => {
  function Hint({ id, hidden }: { id: string; hidden: boolean }) {
    const [shown, , anchor] = useOneTimeHint(id);
    return createElement('span', {
      'data-testid': id,
      'data-shown': String(shown),
      ref: (element: HTMLElement | null) => {
        if (element && hidden) element.checkVisibility = () => false;
        anchor(element);
      },
    });
  }

  it('claims nothing while its anchor is hidden, so a shown hint is not held back', () => {
    render(
      createElement(
        'div',
        null,
        createElement(Hint, { id: 'rowHint', hidden: true }),
        createElement(Hint, { id: 'columnPickerHint', hidden: false })
      )
    );
    expect(screen.getByTestId('rowHint')).toHaveAttribute('data-shown', 'false');
    expect(screen.getByTestId('columnPickerHint')).toHaveAttribute('data-shown', 'true');
  });

  it('shows once a hidden anchor becomes visible', () => {
    const resized: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized.push(callback);
        }
        observe() {}
        disconnect() {}
      }
    );
    let visible = false;
    function Late() {
      const [shown, , anchor] = useOneTimeHint('rowHint');
      return createElement('span', {
        'data-testid': 'late',
        'data-shown': String(shown),
        ref: (element: HTMLElement | null) => {
          if (element) element.checkVisibility = () => visible;
          anchor(element);
        },
      });
    }
    render(createElement(Late));
    act(() => resized.forEach((callback) => callback()));
    expect(screen.getByTestId('late')).toHaveAttribute('data-shown', 'false');

    visible = true;
    act(() => resized.forEach((callback) => callback()));
    expect(screen.getByTestId('late')).toHaveAttribute('data-shown', 'true');
    vi.unstubAllGlobals();
  });

  it('watches no anchor that is inactive or waiting behind a shown hint', () => {
    let watching = 0;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {
          watching += 1;
        }
        disconnect() {
          watching -= 1;
        }
      }
    );
    function Row({ id, active }: { id: string; active: boolean }) {
      const [, , anchor] = useOneTimeHint(id, active);
      return createElement('span', { ref: anchor });
    }
    render(
      createElement(
        'div',
        null,
        createElement(Row, { id: 'columnPickerHint', active: true }),
        createElement(Row, { id: 'rowHint', active: false }),
        createElement(Row, { id: 'rowHint', active: true }),
        createElement(Row, { id: 'rowHint', active: true })
      )
    );
    expect(watching).toBe(1);
    vi.unstubAllGlobals();
  });
});
