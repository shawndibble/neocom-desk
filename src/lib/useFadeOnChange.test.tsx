import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { stubAnimate } from '@/test/animate';
import { stubViewport } from '@/test/viewport';
import { useFadeOnChange } from './useFadeOnChange';

function Harness({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFadeOnChange(ref, value);
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
      duration: 220,
      easing: 'ease-out',
    });
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
