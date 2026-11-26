import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { db, type SkillPlanRecord } from '@/db';
import { configureClipboard, type ClipboardWriter } from '@/lib/clipboard';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { mswServer } from '@/test/msw';
import { renderSkillsRoutes } from '@/test/skillsRoutes';
import {
  RIFTER_TYPE_ID,
  idleSubscribe,
  markPlanDeletedMock,
  scheduleSyncMock,
  subscribeSyncStatusMock,
  triggerSyncMock,
} from '@/test/skillPlansMocks';

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
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/implants`, () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/universe/types/${RIFTER_TYPE_ID}`, () =>
    HttpResponse.json({
      type_id: RIFTER_TYPE_ID,
      name: 'Rifter',
      description: '',
      group_id: 25,
      published: true,
      dogma_attributes: [
        { attribute_id: 182, value: 1.0 },
        { attribute_id: 277, value: 3.0 },
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

export function goToPlanEditor(id = 'plan-1') {
  window.history.pushState({}, '', `/skills/plans/${id}`);
}

export async function openPlanTools() {
  await screen.findByText('Your entries');
  const toggle = screen.queryByRole('button', { name: /plan tools/i });
  if (toggle?.getAttribute('aria-expanded') === 'false') {
    await userEvent.setup().click(toggle);
  }
}

export async function openAssumptions() {
  const toggle = screen.getByRole('button', { name: /^assumptions/i });
  if (toggle.getAttribute('aria-expanded') === 'false') {
    await userEvent.setup().click(toggle);
  }
}

export async function clickOptimizeMode(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Optimize' }));
  await user.click(screen.getByRole('menuitem', { name }));
}

export function toolsSection(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title }).closest('section');
  if (!section) throw new Error(`expected the "${title}" tools section`);
  return section as HTMLElement;
}
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

export function installSkillPlansHarness({ app = false }: { app?: boolean } = {}): void {
  beforeAll(async () => {
    await resetSession();
    const App = app ? (await import('@/app/App')).App : null;
    if (app) {
      const routeChunks = await import('@/app/routeChunks');
      await Promise.all([routeChunks.loadSkillPlans(), routeChunks.loadSkillPlanEditor()]);
    }
    const { unmount } = App ? render(<App />) : renderSkillsRoutes();
    await screen.findByRole('button', { name: 'New plan' }, { timeout: 25_000 });
    unmount();
    server.resetHandlers();
  }, 30_000);
  afterEach(() => {
    configureClipboard(null);
  });
  beforeEach(resetSession);
}

export async function openAllPlans(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'All plans' }));
  return screen.findByRole('dialog', { name: 'All plans' });
}
