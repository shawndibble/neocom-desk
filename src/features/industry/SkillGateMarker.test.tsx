import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { SkillGateMarker } from './SkillGateMarker';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';

const nameForSkill = (typeID: number) => (typeID === 3380 ? 'Industry' : `#${typeID}`);
const nameForCharacter = (id: number) => (id === 7 ? 'Vex Kado' : `#${id}`);

describe('SkillGateMarker', () => {
  it('names the skill and level when exactly one requirement is unmet', () => {
    const verdict: SkillGateVerdict = {
      gated: true,
      shortfall: [{ typeID: 3380, haveLevel: 2, needLevel: 5 }],
      bestCharacterId: 7,
    };
    render(
      <SkillGateMarker
        verdict={verdict}
        nameForSkill={nameForSkill}
        nameForCharacter={nameForCharacter}
      />
    );
    expect(screen.getByText('Industry V')).toBeInTheDocument();
  });

  it('collapses to a count when more than one requirement is unmet', () => {
    const verdict: SkillGateVerdict = {
      gated: true,
      shortfall: [
        { typeID: 3380, haveLevel: 2, needLevel: 5 },
        { typeID: 45746, haveLevel: 0, needLevel: 3 },
      ],
      bestCharacterId: 7,
    };
    render(
      <SkillGateMarker
        verdict={verdict}
        nameForSkill={nameForSkill}
        nameForCharacter={nameForCharacter}
      />
    );
    expect(screen.getByText('2 skills short')).toBeInTheDocument();
  });

  it('lists only the unmet requirements and names the closest character on hover', async () => {
    const user = userEvent.setup();
    const verdict: SkillGateVerdict = {
      gated: true,
      shortfall: [{ typeID: 3380, haveLevel: 0, needLevel: 5 }],
      bestCharacterId: 7,
    };
    render(
      <SkillGateMarker
        verdict={verdict}
        nameForSkill={nameForSkill}
        nameForCharacter={nameForCharacter}
      />
    );
    await user.hover(screen.getByRole('img'));
    expect(
      await screen.findByText('No character on this account can install this job')
    ).toBeInTheDocument();
    expect(screen.getByText('Industry — → V')).toBeInTheDocument();
    expect(screen.getByText('Best on Vex Kado')).toBeInTheDocument();
  });

  // The shortfall rows and the best character are nowhere but the tooltip, so
  // a keyboard has to be able to open it (WCAG 2.1.1).
  it('takes keyboard focus and reveals the shortfall there', () => {
    const verdict: SkillGateVerdict = {
      gated: true,
      shortfall: [{ typeID: 3380, haveLevel: 2, needLevel: 5 }],
      bestCharacterId: 7,
    };
    render(
      <SkillGateMarker
        verdict={verdict}
        nameForSkill={nameForSkill}
        nameForCharacter={nameForCharacter}
      />
    );
    const marker = screen.getByRole('img');
    expect(marker).toHaveAttribute('tabindex', '0');
    fireEvent.focus(marker);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Industry II → V');
    expect(tooltip).toHaveTextContent('Best on Vex Kado');
    expect(marker).toHaveAttribute('aria-describedby', tooltip.id);
  });
});
