import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingSection } from './LandingSection';

describe('LandingSection', () => {
  it('names the landmark by its heading and draws no backdrop for the plain tone', () => {
    const { container } = render(
      <LandingSection id="x" heading="Hello">
        body
      </LandingSection>
    );
    expect(screen.getByRole('region', { name: 'Hello' })).toBeInTheDocument();
    expect(container.querySelector('.lp-layer')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('adds a decorative tone layer and a lazy, hidden ship render', () => {
    const { container } = render(
      <LandingSection id="y" heading="Space" tone="space" ship={{ ship: 'hulk', side: 'right' }}>
        body
      </LandingSection>
    );
    expect(container.querySelector('.lp-layer-space')).toHaveAttribute('aria-hidden', 'true');
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('src', '/landing/hulk.webp');
    expect(img).toHaveClass('lp-ship-right');
  });
});
