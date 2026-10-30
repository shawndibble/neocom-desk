import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { stubViewport } from '@/test/viewport';
import { useFadeOnChange } from './useFadeOnChange';

function Harness({ value, onFirstRender }: { value: string; onFirstRender?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFadeOnChange(ref, value, { onFirstRender });
  return <div ref={ref}>{value}</div>;
}

/** jsdom has no Web Animations API: `animate` is stubbed, as in Layout's route fade tests. */
describe('useFadeOnChange', () => {
  let animate: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;
  let reduceMotion: boolean;
  let restoreViewport: () => void;

  beforeEach(() => {
    reduceMotion = false;
    cancel = vi.fn();
    animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(Element.prototype, 'animate', {
      value: animate,
      writable: true,
      configurable: true,
    });
    restoreViewport = stubViewport((media) =>
      media.includes('prefers-reduced-motion') ? reduceMotion : false
    );
  });

  afterEach(() => {
    restoreViewport();
    // @ts-expect-error -- jsdom has no `animate` of its own to restore
    delete Element.prototype.animate;
  });

  it('fades the element in when the key changes', () => {
    const { rerender } = render(<Harness value="a" />);
    animate.mockClear();
    rerender(<Harness value="b" />);
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
      duration: 140,
      easing: 'ease-out',
    });
  });

  it('stays still when the key is unchanged', () => {
    const { rerender } = render(<Harness value="a" />);
    animate.mockClear();
    rerender(<Harness value="a" />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('fades on the first render by default', () => {
    render(<Harness value="a" />);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('skips the first render when asked', () => {
    const { rerender } = render(<Harness value="a" onFirstRender={false} />);
    expect(animate).not.toHaveBeenCalled();
    rerender(<Harness value="b" onFirstRender={false} />);
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
});
