import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStickyClearance } from './useStickyClearance';

const PROP = '--test-bar-clearance';
const root = () => document.documentElement.style;

let observers: { cb: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];

function Bar({ enabled }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useStickyClearance(ref, 'test-bar', enabled === undefined ? undefined : { enabled });
  return <div ref={ref} data-testid="bar" />;
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      cb: () => void;
      disconnect = vi.fn();
      constructor(cb: () => void) {
        this.cb = cb;
        observers.push(this);
      }
      observe() {}
      unobserve() {}
    }
  );
  vi.stubGlobal('innerHeight', 800);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 700,
  } as DOMRect);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  root().removeProperty(PROP);
});

describe('useStickyClearance', () => {
  it('publishes the covered height plus the focus-ring margin on the root', () => {
    render(<Bar />);
    expect(root().getPropertyValue(PROP)).toBe('calc(100px + 0.75rem)');
  });

  it('re-measures when the element resizes', () => {
    render(<Bar />);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 600,
    } as DOMRect);
    observers[0].cb();
    expect(root().getPropertyValue(PROP)).toBe('calc(200px + 0.75rem)');
  });

  it('removes the property on unmount', () => {
    const { unmount } = render(<Bar />);
    unmount();
    expect(root().getPropertyValue(PROP)).toBe('');
  });

  it('publishes nothing while disabled, and clears when disabled later', () => {
    const { rerender } = render(<Bar enabled={false} />);
    expect(root().getPropertyValue(PROP)).toBe('');
    rerender(<Bar enabled />);
    expect(root().getPropertyValue(PROP)).not.toBe('');
    rerender(<Bar enabled={false} />);
    expect(root().getPropertyValue(PROP)).toBe('');
  });

  it('never writes scrollPaddingBottom inline', () => {
    render(<Bar />);
    expect(root().scrollPaddingBottom).toBe('');
  });
});
