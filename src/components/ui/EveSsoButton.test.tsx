import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { EveSsoButton } from './EveSsoButton';

describe('EveSsoButton', () => {
  it.each(['large', 'small'] as const)('serves a 2x image for the %s artwork', (size) => {
    render(<EveSsoButton size={size} label="Log in" pending={false} onClick={() => {}} />);
    const img = screen.getByRole('img', { name: 'Log in' });
    expect(img.getAttribute('srcset')).toMatch(new RegExp(`${size}@2x\\.png 2x$`));
    expect(img.getAttribute('src')).toContain(`black-${size}.png`);
  });
});
