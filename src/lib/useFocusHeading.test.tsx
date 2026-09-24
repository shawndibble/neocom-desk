import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusHeading } from './useFocusHeading';

function Harness({ level, enabled }: { level: string | null; enabled?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useFocusHeading(ref, level, enabled);
  return (
    <h2 ref={ref} tabIndex={-1}>
      {level ?? 'root'}
    </h2>
  );
}

describe('useFocusHeading', () => {
  it('does not steal focus on first mount', () => {
    render(<Harness level="Jita" />);
    expect(screen.getByRole('heading')).not.toHaveFocus();
  });

  it('focuses the heading when the key changes to a new value', () => {
    const { rerender } = render(<Harness level="Jita" />);
    expect(screen.getByRole('heading')).not.toHaveFocus();

    rerender(<Harness level="Structure #1" />);
    expect(screen.getByRole('heading')).toHaveFocus();
  });

  it('does not focus when the key changes to null', () => {
    const { rerender } = render(<Harness level="Jita" />);
    rerender(<Harness level={null} />);
    expect(screen.getByRole('heading')).not.toHaveFocus();
  });

  it('does not refocus on a re-render with the same key', () => {
    const { rerender } = render(<Harness level="Jita" />);
    rerender(<Harness level="Jita" />);
    expect(screen.getByRole('heading')).not.toHaveFocus();

    // Focus it manually, then confirm an unrelated re-render doesn't re-steal it.
    screen.getByRole('heading').focus();
    rerender(<Harness level="Jita" />);
    expect(screen.getByRole('heading')).toHaveFocus();
  });

  it('focuses again on a second distinct change, moving focus elsewhere in between', () => {
    const { rerender } = render(<Harness level="Jita" />);
    rerender(<Harness level="Structure #1" />);
    expect(screen.getByRole('heading')).toHaveFocus();

    document.body.focus();
    rerender(<Harness level="Amamake" />);
    expect(screen.getByRole('heading')).toHaveFocus();
  });

  it('does not focus while disabled, even when the key changes', () => {
    const { rerender } = render(<Harness level="Jita" enabled={false} />);
    rerender(<Harness level="Structure #1" enabled={false} />);
    expect(screen.getByRole('heading')).not.toHaveFocus();
  });

  it('does not retroactively focus once re-enabled if the key did not change while disabled (e.g. a viewport resize)', () => {
    const { rerender } = render(<Harness level="Jita" enabled={false} />);
    // Same key as before, only `enabled` flips — as when a narrow layout's
    // `isDesktop` toggles true->false on a resize with no new selection.
    rerender(<Harness level="Jita" enabled={true} />);
    expect(screen.getByRole('heading')).not.toHaveFocus();
  });

  it('does not retroactively focus on re-enable even if the key changed while disabled', () => {
    // `prevKey` tracks every render regardless of `enabled`, so it has
    // already caught up to "Structure #1" by the time `enabled` flips back
    // on — there is no unseen change left to fire for.
    const { rerender } = render(<Harness level="Jita" enabled={false} />);
    rerender(<Harness level="Structure #1" enabled={false} />);
    rerender(<Harness level="Structure #1" enabled={true} />);
    expect(screen.getByRole('heading')).not.toHaveFocus();
  });
});
