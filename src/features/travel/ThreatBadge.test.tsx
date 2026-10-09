import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { ThreatBadge } from './ThreatBadge';

describe('ThreatBadge', () => {
  it.each([
    ['dangerous', 'Dangerous', 'text-danger'],
    ['active', 'Active', 'text-warning'],
    ['low', 'Low threat', 'text-text'],
    ['inactive', 'Inactive', 'text-text-dim'],
    ['pending', 'Checking', 'text-text-dim'],
  ] as const)('draws %s as its word in its colour', (level, word, tone) => {
    render(<ThreatBadge level={level} />);
    const badge = screen.getByText(word).closest('span.inline-flex');
    expect(badge?.className).toContain(tone);
  });

  it('names what it measures for a screen reader', () => {
    render(<ThreatBadge level="active" />);
    expect(screen.getByText('Threat:')).toBeTruthy();
  });

  it('has no green level, so no pilot reads as safe', () => {
    for (const level of ['dangerous', 'active', 'low', 'inactive'] as const) {
      const { container, unmount } = render(<ThreatBadge level={level} />);
      expect(container.innerHTML).not.toContain('success');
      unmount();
    }
  });
});
