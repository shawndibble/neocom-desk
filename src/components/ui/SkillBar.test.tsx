import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillBar } from './SkillBar';

describe('SkillBar', () => {
  it('fills segments up to level, leaves the rest empty', () => {
    render(<SkillBar level={3} />);
    const segments = screen.getByRole('img').querySelectorAll('[aria-hidden="true"]');
    expect(segments).toHaveLength(5);
    expect(segments[0]?.className).toContain('bg-accent');
    expect(segments[2]?.className).toContain('bg-accent');
    expect(segments[3]?.className).not.toContain('bg-accent');
  });

  it('renders no partial fill when progress is omitted', () => {
    render(<SkillBar level={2} />);
    const segments = screen.getByRole('img').querySelectorAll('[aria-hidden="true"]');
    expect(segments[2]?.querySelector('span')).toBeNull();
  });

  it('renders a partial fill on the segment just past level, sized to progress', () => {
    render(<SkillBar level={2} progress={0.5} />);
    const segments = screen.getByRole('img').querySelectorAll('[aria-hidden="true"]');
    // Segment index 2 (0-based) is level 3 — the level just past the trained level 2.
    const fill = segments[2]?.querySelector('span');
    expect(fill).toHaveStyle({ width: '50%' });
    // Fully-trained segments (0, 1) get no partial-fill child.
    expect(segments[0]?.querySelector('span')).toBeNull();
  });

  it('renders no partial fill at level 5 even if progress is passed', () => {
    render(<SkillBar level={5} progress={0.9} />);
    const segments = screen.getByRole('img').querySelectorAll('[aria-hidden="true"]');
    expect(segments).toHaveLength(5);
    for (const segment of segments) {
      expect(segment.querySelector('span')).toBeNull();
    }
  });

  it('marks segments past level through plannedLevel as planned, not plain untrained', () => {
    render(<SkillBar level={2} plannedLevel={4} />);
    const segments = screen.getByRole('img').querySelectorAll('[aria-hidden="true"]');
    expect(segments[2]?.className).toContain('accent-dim');
    expect(segments[3]?.className).toContain('accent-dim');
    expect(segments[4]?.className).not.toContain('accent-dim');
    expect(segments[4]?.className).not.toContain('bg-accent');
  });

  it('prefers the planned style over a partial-progress fill on the same segment', () => {
    render(<SkillBar level={2} progress={0.5} plannedLevel={4} />);
    const segments = screen.getByRole('img').querySelectorAll('[aria-hidden="true"]');
    expect(segments[2]?.querySelector('span')).toBeNull();
    expect(segments[2]?.className).toContain('accent-dim');
  });

  it('ignores a plannedLevel at or below the trained level', () => {
    render(<SkillBar level={3} plannedLevel={2} />);
    const segments = screen.getByRole('img').querySelectorAll('[aria-hidden="true"]');
    expect(segments[3]?.className).not.toContain('accent-dim');
  });
});
