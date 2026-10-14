import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HintText } from './HintText';

function mockClip(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
}

describe('HintText onlyWhenTruncated', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('drops the cue when the parent shows the whole text', () => {
    mockClip(100, 100);
    render(
      <div>
        <HintText content="Full name" onlyWhenTruncated>
          Full name
        </HintText>
      </div>
    );
    const el = screen.getByText('Full name');
    expect(el.className).not.toContain('underline');
    expect(el).not.toHaveAttribute('tabindex');
  });

  it('keeps the cue when the parent clips the text', () => {
    mockClip(200, 100);
    render(
      <div>
        <HintText content="Full name" onlyWhenTruncated>
          Full na…
        </HintText>
      </div>
    );
    const el = screen.getByText('Full na…');
    expect(el.className).toContain('underline');
    expect(el).toHaveAttribute('tabindex', '0');
  });
});
