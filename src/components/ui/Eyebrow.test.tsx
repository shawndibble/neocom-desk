import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Eyebrow } from './Eyebrow';
import { eyebrowClassName } from './eyebrowClassName';

describe('Eyebrow', () => {
  it('renders a p with the type recipe by default', () => {
    render(<Eyebrow>Label</Eyebrow>);
    const el = screen.getByText('Label');
    expect(el.tagName).toBe('P');
    expect(el.className).toBe(eyebrowClassName);
  });

  it('swaps the element and appends layout classes', () => {
    render(
      <Eyebrow as="h3" className="mb-1">
        Label
      </Eyebrow>
    );
    const el = screen.getByRole('heading', { name: 'Label' });
    expect(el.className).toBe(`${eyebrowClassName} mb-1`);
  });
});
