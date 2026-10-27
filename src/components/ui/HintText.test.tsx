import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HintText } from './HintText';

/** The parent's content box ends at 100; the text's right edge is `textRight`. */
function mockClip(textRight: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const right = this.tagName === 'SPAN' ? textRight : 100;
    return { right } as DOMRect;
  });
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
    mockClip(100);
    render(
      <div style={{ padding: 0, border: 0 }}>
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
    mockClip(104);
    render(
      <div style={{ padding: 0, border: 0 }}>
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
