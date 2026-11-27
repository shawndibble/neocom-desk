import { describe, it, expect, beforeEach } from 'vitest';
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
});
