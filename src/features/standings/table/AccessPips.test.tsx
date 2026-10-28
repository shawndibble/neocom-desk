import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { AccessPips } from './AccessPips';

describe('AccessPips', () => {
  it('fills the pips up to the level and prints the short form', () => {
    const { container } = render(<AccessPips level={4} />);
    const pips = [...container.querySelectorAll('[data-filled]')];
    expect(pips.map((pip) => pip.getAttribute('data-filled'))).toEqual([
      'true',
      'true',
      'true',
      'true',
      'false',
    ]);
    expect(screen.getByText('L4')).toBeInTheDocument();
  });

  it('says it in words for a screen reader', () => {
    render(<AccessPips level={1} />);
    expect(screen.getByText('Agents up to level 1')).toBeInTheDocument();
  });
});
