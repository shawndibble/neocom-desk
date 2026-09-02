import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import type { SkillType } from '@/sde/types';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const FIXTURE_SKILLS: SkillType[] = [
  {
    typeID: 1,
    name: 'Small Hybrid Turret',
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
  {
    typeID: 2,
    name: 'Frigate',
    description: 'Pilots a <b>Frigate</b>-class starship.',
    groupID: 20,
    groupName: 'Spaceship Command',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [{ skillTypeID: 1, level: 3 }],
  },
];

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => FIXTURE_SKILLS),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;

const skillsPayload = {
  skills: [
    { skill_id: 1, trained_skill_level: 5, active_skill_level: 5, skillpoints_in_skill: 256000 },
    { skill_id: 2, trained_skill_level: 3, active_skill_level: 3, skillpoints_in_skill: 8000 },
  ],
  total_sp: 264000,
  unallocated_sp: 1500,
};

const attributesPayload = {
  charisma: 19,
  intelligence: 20,
  memory: 21,
  perception: 22,
  willpower: 23,
};

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
    HttpResponse.json(skillsPayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
    HttpResponse.json(attributesPayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/implants`, () =>
    HttpResponse.json([9899])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () => HttpResponse.json([])),
  http.get('https://esi.evetech.net/universe/types/9899', () =>
    HttpResponse.json({
      type_id: 9899,
      name: 'Ocular Filter - Basic',
      description: 'A basic <b>ocular filter</b> implant.',
      group_id: 300,
      published: true,
      dogma_attributes: [{ attribute_id: 178, value: 3.0 }], // +3 perception
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
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
    scopes: ['esi-skills.read_skills.v1', 'esi-skills.read_skillqueue.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/skills');
});

describe('Skills', () => {
  it('renders groups, trained levels, and SP from mocked ESI', async () => {
    render(<App />);

    expect(await screen.findByText('Gunnery')).toBeInTheDocument();
    expect(await screen.findByText('Spaceship Command')).toBeInTheDocument();
    expect(screen.getByText('264,000')).toBeInTheDocument(); // total SP
    expect(screen.getByText('1,500')).toBeInTheDocument(); // unallocated SP
    // Groups start collapsed — expand both before asserting row content.
    fireEvent.click(screen.getByRole('button', { name: /Gunnery/ }));
    fireEvent.click(screen.getByRole('button', { name: /Spaceship Command/ }));
    expect(screen.getByText('256,000 SP')).toBeInTheDocument();
    expect(screen.getByText('8,000 SP')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Level 5 of 5' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Level 3 of 5' })).toBeInTheDocument();
    expect(await screen.findByText('Ocular Filter - Basic')).toBeInTheDocument();
    // Tooltip content is in the DOM (CSS-revealed on hover/focus), markup stripped.
    // Two tooltips exist now: the implant chip's, and the Frigate skill row's.
    const tooltipTexts = screen.getAllByRole('tooltip').map((el) => el.textContent);
    expect(tooltipTexts).toContain('A basic ocular filter implant.');
    expect(tooltipTexts).toContain('Pilots a Frigate-class starship.');

    // ESI perception 22 already includes the +3 implant: base 19 + 3 = 22.
    expect(await screen.findByText('19 + 3 = 22')).toBeInTheDocument();
    // Unbonused attributes show the base value plainly.
    expect(screen.getByText('20')).toBeInTheDocument(); // intelligence, no bonus
  });

  it('shows the level from a finished queue entry that /skills has not caught up to', async () => {
    // ESI: "/skills is not updated until the character logs in ... entries
    // that are in the past need to be applied on top of this list."
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 2,
            queue_position: 0,
            finished_level: 4,
            start_date: '2026-08-20T00:00:00Z',
            finish_date: '2026-08-25T00:00:00Z',
            level_end_sp: 45255,
          },
        ])
      )
    );

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Spaceship Command/ }));
    expect(screen.getByRole('img', { name: 'Level 4 of 5' })).toBeInTheDocument();
    expect(screen.getByText('45,255 SP')).toBeInTheDocument();
    // The stale /skills reading is gone, not shown alongside.
    expect(screen.queryByRole('img', { name: 'Level 3 of 5' })).not.toBeInTheDocument();
    expect(screen.queryByText('8,000 SP')).not.toBeInTheDocument();
    // The total moves with the row. Leaving ESI's total_sp alone would show
    // 45,255 SP on a skill inside a 264,000 SP total that still counts 8,000.
    expect(screen.getByText('301,255')).toBeInTheDocument(); // 264,000 + 37,255
    expect(screen.queryByText('264,000')).not.toBeInTheDocument();
  });

  it('credits the level but not the SP when ESI withheld level_end_sp', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 2,
            queue_position: 0,
            finished_level: 4,
            start_date: '2026-08-20T00:00:00Z',
            finish_date: '2026-08-25T00:00:00Z',
          },
        ])
      )
    );

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Spaceship Command/ }));
    expect(screen.getByRole('img', { name: 'Level 4 of 5' })).toBeInTheDocument();
    // The last known SP stands, and so does the total. Neither is guessed up.
    expect(screen.getByText('8,000 SP')).toBeInTheDocument();
    expect(screen.getByText('264,000')).toBeInTheDocument();
  });

  it('shows Unknown SP for a skill only the queue knows about', async () => {
    // /skills omits the skill entirely and the entry carries no level_end_sp,
    // so the level is known and the SP is not. A literal 0 would read as
    // broken rather than as unknown.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 1337,
            queue_position: 0,
            finished_level: 1,
            start_date: '2026-08-20T00:00:00Z',
            finish_date: '2026-08-25T00:00:00Z',
          },
        ])
      )
    );

    render(<App />);

    const unknownGroupButton = await screen.findByText('—');
    fireEvent.click(unknownGroupButton.closest('button')!);
    expect(await screen.findByText('#1337')).toBeInTheDocument();
    const row = screen.getByText('#1337').closest('li')!;
    expect(within(row).getByText('—')).toBeInTheDocument(); // common.unknown
    expect(within(row).queryByText('0 SP')).not.toBeInTheDocument();
  });

  it('skips the queue read and shows no reauth notice when the character never granted the queue scope', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['esi-skills.read_skills.v1'],
    });
    let queueRequests = 0;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () => {
        queueRequests += 1;
        return HttpResponse.json([], { status: 403 });
      })
    );

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Spaceship Command/ }));
    // Trained level comes from /skills alone — no queue correction attempted.
    expect(screen.getByRole('img', { name: 'Level 3 of 5' })).toBeInTheDocument();
    expect(screen.getByText('8,000 SP')).toBeInTheDocument();
    expect(queueRequests).toBe(0);
    expect(screen.queryByText('EVE access was refused')).not.toBeInTheDocument();
  });

  it('falls back to cached skills when ESI is unreachable', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'skills',
      value: skillsPayload,
      fetchedAt: Date.now(),
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () => HttpResponse.error())
    );

    render(<App />);

    expect(await screen.findByText('Gunnery')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () => HttpResponse.error())
    );

    render(<App />);

    expect(await screen.findByText(/no skill data cached/i)).toBeInTheDocument();
  });

  it('shows a re-login banner (not a silent offline empty state) on a 401 (BUG #3)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    render(<App />);

    expect(await screen.findByRole('button', { name: /log in again/i })).toBeInTheDocument();
    expect(screen.queryByText(/no skill data cached/i)).not.toBeInTheDocument();
    const { beginEveLogin } = await import('@/app/loginFlow');
    screen.getByRole('button', { name: /log in again/i }).click();
    expect(beginEveLogin).toHaveBeenCalled();
  });

  it('disables CSV export in the re-login state, so a stale cache cannot be exported behind the banner', async () => {
    // The invariant: whatever the route refuses to render, export refuses to
    // hand over. loadWithCacheStatus deliberately still reads the cache on an
    // auth failure ("needsReauth never short-circuits the cache read"), so
    // nothing upstream guarantees `groups` is empty here.
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'skills',
      value: skillsPayload,
      fetchedAt: Date.now(),
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    render(<App />);

    // The route's own banner, not Layout's global auth notice — the latter
    // fires on emitEsiAuthFailure, before the snapshot settles.
    expect(await screen.findByText(/log in again to see skills/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeDisabled();
  });

  it("shows a selected skill's prerequisites, marking an already-trained one distinct", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Spaceship Command/ }));
    const frigateRow = await screen.findByRole('button', { name: /Frigate/ });
    fireEvent.click(frigateRow);

    const prereqsHeading = await screen.findByText('Prerequisites');
    const prereqsSection = prereqsHeading.closest('section')!;
    // Frigate needs Small Hybrid Turret III; the character has it trained to V.
    expect(within(prereqsSection).getByText('Small Hybrid Turret')).toBeInTheDocument();
    expect(within(prereqsSection).getByText('Trained · Level 3')).toBeInTheDocument();
  });

  it('shows what a selected skill unlocks, derived from the reverse of prereqs', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Gunnery/ }));
    const turretRow = await screen.findByRole('button', { name: /Small Hybrid Turret/ });
    fireEvent.click(turretRow);

    const unlocksHeading = await screen.findByText('Unlocks');
    const unlocksSection = unlocksHeading.closest('section')!;
    expect(within(unlocksSection).getByText('Frigate')).toBeInTheDocument();
    expect(within(unlocksSection).getByText('Level 3')).toBeInTheDocument();
  });

  it('does not render a tooltip bubble for a skill row with no description', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Gunnery/ }));
    const turretRow = await screen.findByRole('button', { name: /Small Hybrid Turret/ });
    expect(turretRow.closest('li')?.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("shows the selected skill's description above its prerequisites", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Spaceship Command/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Frigate/ }));

    const prereqsHeading = await screen.findByText('Prerequisites');
    const panel = screen.getByRole('button', { name: /close/i }).closest('section')!;
    const description = within(panel).getByText('Pilots a Frigate-class starship.');
    expect(
      description.compareDocumentPosition(prereqsHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('deselects a skill (closing the inspector) on a second click', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Spaceship Command/ }));
    const frigateRow = await screen.findByRole('button', { name: /Frigate/ });
    fireEvent.click(frigateRow);
    expect(await screen.findByText('Prerequisites')).toBeInTheDocument();

    fireEvent.click(frigateRow);
    expect(screen.queryByText('Prerequisites')).not.toBeInTheDocument();
  });

  it('starts every group collapsed, expands on header click, and collapses again on a second click', async () => {
    render(<App />);

    await screen.findByText('Gunnery');
    expect(screen.queryByText('Frigate')).not.toBeInTheDocument();

    const spaceshipHeader = screen.getByRole('button', { name: /Spaceship Command/ });
    expect(spaceshipHeader).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(spaceshipHeader);
    expect(spaceshipHeader).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Frigate')).toBeInTheDocument();

    fireEvent.click(spaceshipHeader);
    expect(spaceshipHeader).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Frigate')).not.toBeInTheDocument();
  });

  it('"Expand all" opens every group; a separate control collapses them again', async () => {
    render(<App />);

    await screen.findByText('Gunnery');
    expect(screen.queryByText('Frigate')).not.toBeInTheDocument();
    expect(screen.queryByText('Small Hybrid Turret')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText('Frigate')).toBeInTheDocument();
    expect(screen.getByText('Small Hybrid Turret')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByText('Frigate')).not.toBeInTheDocument();
    expect(screen.queryByText('Small Hybrid Turret')).not.toBeInTheDocument();
  });

  it('search hides non-matching groups, auto-expands a matching one, and restores prior state on clear', async () => {
    render(<App />);

    await screen.findByText('Gunnery');
    // Manually expand Gunnery so we can confirm its state survives a search.
    fireEvent.click(screen.getByRole('button', { name: /^Gunnery/ }));
    expect(screen.getByText('Small Hybrid Turret')).toBeInTheDocument();

    const search = screen.getByPlaceholderText('Search skills…');
    fireEvent.change(search, { target: { value: 'fr' } });
    // Under the 3-character threshold: no filtering, Gunnery still expanded, Spaceship Command still collapsed.
    expect(screen.getByText('Small Hybrid Turret')).toBeInTheDocument();
    expect(screen.queryByText('Frigate')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'frigate' } });
    // Spaceship Command auto-expands to show the match; Gunnery has no match and disappears entirely.
    expect(await screen.findByText('Frigate')).toBeInTheDocument();
    expect(screen.queryByText('Gunnery')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    // Clearing restores prior state: Gunnery (manually expanded) is back and still expanded,
    // Spaceship Command (only auto-expanded by the search) is collapsed again.
    expect(await screen.findByText('Gunnery')).toBeInTheDocument();
    expect(screen.getByText('Small Hybrid Turret')).toBeInTheDocument();
    expect(screen.queryByText('Frigate')).not.toBeInTheDocument();
  });

  it('shows an empty state when the search matches no skill', async () => {
    render(<App />);

    await screen.findByText('Gunnery');
    fireEvent.change(screen.getByPlaceholderText('Search skills…'), {
      target: { value: 'nonexistent' },
    });
    expect(await screen.findByText('No skills match your search.')).toBeInTheDocument();
  });
});
