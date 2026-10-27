import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { DESKTOP_QUERY } from '@/lib/useIsDesktop';
import { ESI_REGISTRY } from '@/esi/registry';
import type { SkillCatalog } from '@/features/skills/skillMap';
import type { EngineSkill } from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import { PlanListPane } from './PlanListPane';

const CHAR_ID = 91;

function stubMatchMedia(matchesDesktop: boolean) {
  const real = window.matchMedia;
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: matchesDesktop && media === DESKTOP_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  return () => {
    window.matchMedia = real;
  };
}

function scrollerDiv(container: HTMLElement): HTMLElement {
  const div = container.querySelector('.overflow-y-auto');
  if (!div) throw new Error('expected the scroller div');
  return div as HTMLElement;
}

beforeEach(async () => {
  await db.skillPlans.clear();
});

describe('PlanListPane: viewport height ignoring the mobile tab bar (#1096)', () => {
  it('applies no inline max-height on mobile, leaving the page (which already reserves room for the fixed tab bar) to scroll instead', async () => {
    const restore = stubMatchMedia(false);
    try {
      const { container } = render(
        <MemoryRouter>
          <PlanListPane activeCharacterId={CHAR_ID} remapInfo={null} />
        </MemoryRouter>
      );
      await screen.findByRole('button', { name: 'New plan' });

      expect(scrollerDiv(container).style.maxHeight).toBe('');
    } finally {
      restore();
    }
  });

  it('still caps the list to the viewport on desktop, where it sits beside another column', async () => {
    const restore = stubMatchMedia(true);
    try {
      const { container } = render(
        <MemoryRouter>
          <PlanListPane activeCharacterId={CHAR_ID} remapInfo={null} />
        </MemoryRouter>
      );
      await screen.findByRole('button', { name: 'New plan' });

      expect(scrollerDiv(container).style.maxHeight).not.toBe('');
    } finally {
      restore();
    }
  });
});

describe('PlanListPane: per-plan schedule stats (#1416)', () => {
  const skill: EngineSkill = {
    typeID: 10,
    name: 'A',
    rank: 1,
    primary: 'intelligence',
    secondary: 'memory',
    prereqs: [],
    alphaMaxLevel: 5,
  };
  const catalog: SkillCatalog = {
    engineSkills: new Map([[skill.typeID, skill]]),
    bySkillTypeID: new Map(),
    unlocksByTypeID: new Map(),
  };
  const scheduleInputs = (trainedSkillsKnown: boolean) => ({
    catalog,
    trained: new Map(),
    trainedSkillsKnown,
    queueEntries: [],
    attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 },
    attributeBaseline: null,
    implants: {},
  });

  async function seed() {
    await db.skillPlans.add({
      id: 'p1',
      characterId: CHAR_ID,
      name: 'Empty plan',
      entries: [],
      remapCount: 0,
      updatedAt: Date.now(),
    } as unknown as SkillPlanRecord);
  }

  it('shows the stats line once trained skills are known', async () => {
    await seed();
    render(
      <MemoryRouter>
        <PlanListPane
          activeCharacterId={CHAR_ID}
          remapInfo={null}
          scheduleInputs={scheduleInputs(true)}
        />
      </MemoryRouter>
    );
    expect(await screen.findByText('Nothing to train')).toBeInTheDocument();
  });

  it('holds the line back until trained skills are known', async () => {
    await seed();
    render(
      <MemoryRouter>
        <PlanListPane
          activeCharacterId={CHAR_ID}
          remapInfo={null}
          scheduleInputs={scheduleInputs(false)}
        />
      </MemoryRouter>
    );
    await screen.findByText('Empty plan');
    expect(screen.queryByText('Nothing to train')).not.toBeInTheDocument();
  });

  it('stays name-only without scheduleInputs (the editor sidebar)', async () => {
    await seed();
    render(
      <MemoryRouter>
        <PlanListPane activeCharacterId={CHAR_ID} remapInfo={null} />
      </MemoryRouter>
    );
    await screen.findByText('Empty plan');
    expect(screen.queryByText('Nothing to train')).not.toBeInTheDocument();
  });

  describe('Character details implant note (issue #1588)', () => {
    const NOTE = 'Assumes no implants';

    async function seedGrant(scopes: readonly string[]): Promise<void> {
      await db.tokens.put({
        characterId: CHAR_ID,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 60_000,
        scopes: [...scopes],
      });
    }

    function renderPane(height?: 'viewport' | 'sidebar') {
      render(
        <MemoryRouter>
          <PlanListPane
            activeCharacterId={CHAR_ID}
            remapInfo={null}
            scheduleInputs={scheduleInputs(true)}
            height={height}
          />
        </MemoryRouter>
      );
    }

    afterEach(async () => {
      await db.tokens.clear();
    });

    it('notes that row training times assume no implants when the grant is missing', async () => {
      await seed();
      await seedGrant([]);
      renderPane();

      expect(await screen.findByText(NOTE)).toBeInTheDocument();
    });

    it('hides the note once Character details is granted', async () => {
      await seed();
      await seedGrant([ESI_REGISTRY.getCharacterImplants.scope]);
      renderPane();

      await screen.findByText('Nothing to train');
      await waitFor(() => expect(screen.queryByText(NOTE)).not.toBeInTheDocument());
    });

    it('hides the note when every plan sets its own What-If implants', async () => {
      await db.skillPlans.add({
        id: 'p2',
        characterId: CHAR_ID,
        name: 'Override plan',
        entries: [],
        remapCount: 0,
        updatedAt: Date.now(),
        whatIfImplants: { kind: 'preset', preset: 'none' },
      } as unknown as SkillPlanRecord);
      await seedGrant([]);
      renderPane();

      await screen.findByText('Nothing to train');
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    });

    it('leaves the note to the Plan Editor when shown as its sidebar', async () => {
      await seed();
      await seedGrant([]);
      renderPane('sidebar');

      await screen.findByText('Nothing to train');
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    });
  });
});
