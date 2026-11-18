import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DialogFooter } from './DialogFooter';

describe('DialogFooter', () => {
  it('right-aligns its buttons by default', () => {
    render(
      <DialogFooter>
        <button>Cancel</button>
      </DialogFooter>
    );
    const el = screen.getByRole('button').parentElement!;
    expect(el.className).toContain('flex');
    expect(el.className).toContain('justify-end');
    expect(el.className).toContain('gap-2');
  });

  it('stacks full-width on a phone', () => {
    render(
      <DialogFooter stacked>
        <button>Cancel</button>
      </DialogFooter>
    );
    const el = screen.getByRole('button').parentElement!;
    expect(el.className).toContain('flex-col-reverse');
    expect(el.className).toContain('[&>button]:w-full');
    expect(el.className).not.toContain('justify-end');
  });

  it('appends spacing classes', () => {
    render(
      <DialogFooter className="mt-3">
        <button>Cancel</button>
      </DialogFooter>
    );
    expect(screen.getByRole('button').parentElement!.className).toContain('mt-3');
  });
});
