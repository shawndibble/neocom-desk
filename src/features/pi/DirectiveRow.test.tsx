import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { LoadMeter } from './DirectiveRow';

describe('LoadMeter', () => {
  it('renders its track at the shared h-1.5 progress-track height (#828)', () => {
    render(<LoadMeter label="tf" used={50} budget={100} />);
    expect(screen.getByRole('progressbar')).toHaveClass('h-1.5');
  });
});
