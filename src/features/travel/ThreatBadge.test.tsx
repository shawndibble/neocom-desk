import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { ThreatBadge } from './ThreatBadge';

describe('ThreatBadge', () => {
  it.each([
    ['dangerous', 'Dangerous', 'text-danger'],
    ['active', 'Active', 'text-warning'],
    ['low', 'Low', 'text-text'],
    ['inactive', 'Quiet', 'text-text-dim'],
    ['pending', 'Checking', 'text-text-dim'],
  ] as const)('draws %s as its word in its colour', (level, word, tone) => {
    render(<ThreatBadge level={level} />);
    const badge = screen.getByText(word).closest('span.inline-flex');
    expect(badge?.className).toContain(tone);
  });

  it('names what it measures for a screen reader', () => {
    render(<ThreatBadge level="inactive" />);
    // One short word on screen, the full wording for a screen reader.
    expect(screen.getByText('Threat: No recent kills')).toBeTruthy();
    expect(screen.getByText('Quiet')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no green level, so no pilot reads as safe', () => {
    for (const level of ['dangerous', 'active', 'low', 'inactive'] as const) {
      const { container, unmount } = render(<ThreatBadge level={level} />);
      expect(container.innerHTML).not.toContain('success');
      unmount();
    }
  });
});
