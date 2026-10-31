import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db, type SkillPlanRecord } from '@/db';
import { configureClipboard, type ClipboardWriter } from '@/lib/clipboard';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import { mswServer } from '@/test/msw';
import {
  RIFTER_TYPE_ID,
  idleSubscribe,
  markPlanDeletedMock,
  scheduleSyncMock,
  subscribeSyncStatusMock,
  triggerSyncMock,
} from '@/test/skillPlansMocks';

// Shared harness for the SkillPlans route tests (src/routes/SkillPlans*.test.tsx),
// one file per concern so CI runs them in parallel. The `vi.mock` calls stay in
// each test file (vitest hoists them per file); their factories live in
// skillPlansMocks.tsx.

export const CHAR_ID = 91;
export const attributesPayload = {
  charisma: 19,
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
};
export const emptySkillsPayload = { skills: [], total_sp: 0, unallocated_sp: 0 };

export const server = mswServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
    HttpResponse.json(emptySkillsPayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
    HttpResponse.json(attributesPayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
    HttpResponse.json([
      { skill_id: 1, queue_position: 0, finished_level: 3 },
      { skill_id: 3, queue_position: 1, finished_level: 1 },
    ])
  ),
  // Loaded alongside attributes for the What-If Implants lens (PlanEditor);
  // no test in this file exercises real implant bonuses, so no implants.
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/implants`, () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/universe/types/${RIFTER_TYPE_ID}`, () =>
    HttpResponse.json({
      type_id: RIFTER_TYPE_ID,
      name: 'Rifter',
      description: '',
      group_id: 25,
      published: true,
      dogma_attributes: [
        { attribute_id: 182, value: 1.0 }, // requires Gunnery (typeID 1)...
        { attribute_id: 277, value: 3.0 }, // ...level III
      ],
    })
  )
);

export function seedPlan(overrides: Partial<SkillPlanRecord> = {}): SkillPlanRecord {
  return {
    id: 'plan-1',
    characterId: CHAR_ID,
    name: 'Test plan',
    entries: [],
    remapCount: 0,
    updatedAt: 1,
    ...overrides,
  };
}

/** Most editor-focused tests below seed a single plan and want its editor
 * page open immediately, rather than exercising the list-click navigation
 * that `SkillPlans CRUD` already covers. */
export function goToPlanEditor(id = 'plan-1') {
  window.history.pushState({}, '', `/skills/plans/${id}`);
}

/**
 * Below `lg` — where jsdom's stub `matchMedia` always lands — the plan's
 * tools (optimize/marker actions, the what-if lens, import/export) sit in a
 * collapsed disclosure, so the plan itself leads the page. Editor tests open
 * it before reaching for anything inside. Doubles as the "editor is up" wait,
 * and is a no-op once open.
 */
export async function openPlanTools() {
  await screen.findByText('Your entries');
  const toggle = screen.queryByRole('button', { name: /plan tools/i });
  if (toggle?.getAttribute('aria-expanded') === 'false') {
    await userEvent.setup().click(toggle);
  }
}

/**
 * Alpha, What-if implants, Booster and Skill injectors sit one level inside
 * Plan tools, under a closed-by-default Assumptions row. Opens it; call after
 * `openPlanTools`.
 */
export async function openAssumptions() {
  const toggle = screen.getByRole('button', { name: /^assumptions/i });
  if (toggle.getAttribute('aria-expanded') === 'false') {
    await userEvent.setup().click(toggle);
  }
}

/** Opens the Actions section's "Optimize" dropdown and clicks one of its mode items (#1411). */
export async function clickOptimizeMode(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Optimize' }));
  await user.click(screen.getByRole('menuitem', { name }));
}

/**
 * The tools-pane section a heading titles (Actions / Attributes /
 * Import / Export). `closest('section')`, not `parentElement`: a heading
 * shares a flex row with its section's optional right-aligned actions (the
 * Attributes section's `DataAgeBadge`).
 */
export function toolsSection(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title }).closest('section');
  if (!section) throw new Error(`expected the "${title}" tools section`);
  return section as HTMLElement;
}
/** The clipboard writer the current test installed; replaced on every reset. */
export const clipboard: { writeText: ReturnType<typeof vi.fn<ClipboardWriter>> } = {
  writeText: vi.fn<ClipboardWriter>(),
};

export async function resetSession() {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.skillPlans.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: [],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });

  clipboard.writeText = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
  configureClipboard(clipboard.writeText);

  markPlanDeletedMock.mockClear();
  scheduleSyncMock.mockClear();
  triggerSyncMock.mockClear();
  subscribeSyncStatusMock.mockClear().mockImplementation(idleSubscribe);

  window.history.pushState({}, '', '/skills/plans');
}

export function installSkillPlansHarness(): void {
  beforeAll(async () => {
    // One throwaway render of the plans page, so no test pays for the first one:
    // a worker's first `App` render (lazy route chunks, jsdom, React warm-up) is
    // seconds, and it landed on whichever test ran first, past its 1s findBy.
    await Promise.all([routeChunks.loadSkillPlans(), routeChunks.loadSkillPlanEditor()]);
    await resetSession();
    const { unmount } = render(<App />);
    await screen.findByRole('button', { name: 'New plan' }, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
  }, 30_000);
  afterEach(() => {
    configureClipboard(null);
  });
  beforeEach(resetSession);
}

/** Opens the "All plans" popover from the plan card. */
export async function openAllPlans(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'All plans' }));
  return screen.findByRole('dialog', { name: 'All plans' });
}
