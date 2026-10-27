import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { ExternalLink } from './ExternalLink';
import { HintText } from './HintText';

describe('ExternalLink', () => {
  it('opens a new tab safely and marks the exit for sight and screen readers', () => {
    render(<ExternalLink href="https://zkillboard.com/">zKillboard</ExternalLink>);
    const link = screen.getByRole('link', { name: /zKillboard/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('(opens in a new tab)');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('wears the inline link recipe by default and the quiet one on request', () => {
    render(
      <>
        <ExternalLink href="https://a.example">A</ExternalLink>
        <ExternalLink href="https://b.example" variant="quiet">
          B
        </ExternalLink>
      </>
    );
    expect(screen.getByRole('link', { name: /A/ })).toHaveClass('text-accent', 'underline');
    expect(screen.getByRole('link', { name: /B/ })).not.toHaveClass('text-accent');
  });
});

describe('HintText', () => {
  it('is a focusable dotted-underline span', () => {
    render(<HintText content="Because">Why</HintText>);
    const span = screen.getByText('Why');
    expect(span).toHaveAttribute('tabindex', '0');
    expect(span).toHaveClass('underline', 'decoration-dotted', 'cursor-help');
  });
});
