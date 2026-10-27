import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterSwatch } from './CharacterSwatch';
import { CHARACTER_COLORS, characterStroke } from './layerMeta';

describe('CharacterSwatch', () => {
  it('matches the line stroke and hides from assistive tech', () => {
    render(<CharacterSwatch index={1} />);
    const swatch = screen.getByTestId('character-swatch');
    expect(swatch).toHaveAttribute('aria-hidden', 'true');
    expect(swatch.querySelector('line')).toHaveAttribute('stroke', characterStroke(1).color);
    expect(swatch.querySelector('line')).not.toHaveAttribute('stroke-dasharray');
  });

  it('carries the dash pattern from the 7th Character on', () => {
    render(<CharacterSwatch index={CHARACTER_COLORS.length} />);
    const line = screen.getByTestId('character-swatch').querySelector('line')!;
    expect(line).toHaveAttribute('stroke-dasharray', characterStroke(CHARACTER_COLORS.length).dash);
  });
});
