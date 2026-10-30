import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { stubAnimate } from '@/test/animate';
import { stubViewport } from '@/test/viewport';
import { useFadeOnChange } from './useFadeOnChange';

function Nested({ outer, inner }: { outer: string; inner: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFadeOnChange(ref, outer);
  return (
    <div ref={ref} data-testid="outer">
      <Harness value={inner} rise />
    </div>
  );
}

function Harness({ value, rise }: { value: string; rise?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFadeOnChange(ref, value, rise === undefined ? undefined : { rise });
  return <div ref={ref}>{value}</div>;
}

describe('useFadeOnChange', () => {
  let animate: ReturnType<typeof stubAnimate>['animate'];
  let cancel: ReturnType<typeof stubAnimate>['cancel'];
  let restoreAnimate: () => void;
  let reduceMotion: boolean;
  let restoreViewport: () => void;

  beforeEach(() => {
    reduceMotion = false;
    ({ animate, cancel, restore: restoreAnimate } = stubAnimate());
    restoreViewport = stubViewport((media) =>
      media.includes('prefers-reduced-motion') ? reduceMotion : false
    );
  });

  afterEach(() => {
    restoreViewport();
    restoreAnimate();
  });

  it('fades the element in when the key changes', () => {
    const { rerender } = render(<Harness value="a" />);
    animate.mockClear();
    rerender(<Harness value="b" />);
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
      id: 'fade-on-change',
      duration: 220,
      easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
    });
  });

  it('rises into place as it fades when asked to', () => {
    const { rerender } = render(<Harness value="a" rise />);
    animate.mockClear();
    rerender(<Harness value="b" rise />);
    expect(animate).toHaveBeenCalledWith(
      [
        { opacity: 0, translate: '0 8px' },
        { opacity: 1, translate: '0 0' },
      ],
      { id: 'fade-on-change', duration: 240, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' }
    );
  });

  it('stays still when the key is unchanged', () => {
    const { rerender } = render(<Harness value="a" />);
    animate.mockClear();
    rerender(<Harness value="a" />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('fades on the first render', () => {
    render(<Harness value="a" />);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('cancels a fade still running when the key changes again', () => {
    const { rerender } = render(<Harness value="a" />);
    rerender(<Harness value="b" />);
    expect(cancel).toHaveBeenCalled();
  });

  it('lets the outer view alone move when both change at once', () => {
    const { getByTestId, rerender } = render(<Nested outer="page" inner="tab" />);
    expect(cancel).toHaveBeenCalledWith(getByTestId('outer').firstElementChild);
    cancel.mockClear();
    rerender(<Nested outer="page" inner="other-tab" />);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('does not animate under prefers-reduced-motion', () => {
    reduceMotion = true;
    const { rerender } = render(<Harness value="a" />);
    rerender(<Harness value="b" />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('does not fade an unchanged view when reduced motion is turned off', () => {
    reduceMotion = true;
    const { rerender } = render(<Harness value="a" />);
    reduceMotion = false;
    restoreViewport();
    restoreViewport = stubViewport(() => false);
    rerender(<Harness value="a" />);
    expect(animate).not.toHaveBeenCalled();
  });
});
