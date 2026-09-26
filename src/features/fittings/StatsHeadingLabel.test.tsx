import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { NO_SKILL_OVERRIDES } from '@/engine/fittings/skillOverrides';
import { useSkillOverrides } from './statsConditions';
import { StatsHeadingLabel } from './StatsHeadingLabel';

function renderWith(skills: typeof NO_SKILL_OVERRIDES, characterName: string | null) {
  useSkillOverrides.setState({ skills });
  return render(
    <StatsHeadingLabel hasCharacter={characterName !== null} characterName={characterName} />
  );
}

describe('StatsHeadingLabel', () => {
  afterEach(() => useSkillOverrides.setState({ skills: NO_SKILL_OVERRIDES }));

  it("says the pilot's own skills only when those are what the stats use", () => {
    renderWith(NO_SKILL_OVERRIDES, 'Test Pilot');
    expect(screen.getByText('Stats as Test Pilot, own skills')).toBeInTheDocument();
  });

  it('says All V or All 0 when the Skills control is set to it', () => {
    const { unmount } = renderWith({ base: 'allV', levels: {} }, 'Test Pilot');
    expect(screen.getByText('Stats as Test Pilot, all skills V')).toBeInTheDocument();
    unmount();
    renderWith({ base: 'all0', levels: {} }, 'Test Pilot');
    expect(screen.getByText('Stats as Test Pilot, all skills 0')).toBeInTheDocument();
  });

  it('counts single skills set on top', () => {
    renderWith({ base: 'character', levels: { 3300: 5, 3301: 0 } }, 'Test Pilot');
    expect(
      screen.getByText('Stats as Test Pilot, own skills · 2 skills set by hand')
    ).toBeInTheDocument();
  });

  it('reads All V with no Character, unless the control says All 0', () => {
    const { unmount } = renderWith(NO_SKILL_OVERRIDES, null);
    expect(screen.getByText('Stats at all skills V')).toBeInTheDocument();
    unmount();
    renderWith({ base: 'all0', levels: { 3300: 3 } }, null);
    expect(screen.getByText('Stats at all skills 0 · 1 skill set by hand')).toBeInTheDocument();
  });
});
