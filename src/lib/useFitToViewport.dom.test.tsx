import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useFitToViewport } from '@/lib/useFitToViewport';

function Pane({ active, property }: { active: boolean; property?: 'height' | 'maxHeight' }) {
  const ref = useFitToViewport<HTMLDivElement>(active, property);
  return <div ref={ref} data-testid="pane" />;
}

function stubGeometry(top: number, innerHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);
  vi.stubGlobal('innerHeight', innerHeight);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useFitToViewport', () => {
  it('ends the element 12px above the viewport bottom, wherever its top is', () => {
    stubGeometry(200, 800);
    const { getByTestId } = render(<Pane active />);
    expect(getByTestId('pane').style.height).toBe('588px');
  });

  it('measures from the 12px clearance once the element is stuck at the top', () => {
    stubGeometry(4, 800);
    const { getByTestId } = render(<Pane active />);
    expect(getByTestId('pane').style.height).toBe('776px');
  });

  it('sets max-height when asked, and leaves the element alone while inactive', () => {
    stubGeometry(200, 800);
    const { getByTestId, rerender } = render(<Pane active property="maxHeight" />);
    expect(getByTestId('pane').style.maxHeight).toBe('588px');
    rerender(<Pane active={false} property="maxHeight" />);
    expect(getByTestId('pane').style.maxHeight).toBe('');
  });
});
