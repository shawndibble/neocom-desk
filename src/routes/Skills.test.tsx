import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import { configureClipboard } from '@/lib/clipboard';
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
  {
    // In the SDE but not in the character's skills: a skill whose book is still to buy.
    typeID: 3,
    name: 'Sharpshooter',
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 2,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [{ skillTypeID: 1, level: 1 }],
  },
];

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => FIXTURE_SKILLS),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

// The baked typeInfo shard lacks every type here, so reads take the ESI fallback.
vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn(async () => null) }));

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

const server = mswServer(
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
  // The trained view's own route: /skills is the section index and redirects
  // to the plan list, which is where the Skills section now opens.
  window.history.pushState({}, '', '/skills/trained');
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
    const frigateTrigger = screen.getByText('Frigate').closest('a')!;
    fireEvent.focus(frigateTrigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Pilots a Frigate-class starship.');

    // ESI perception 22 already includes the +3 implant: base 19 + 3 = 22.
    // The chip shows the total; the terms are what its hover reveals.
    expect(await screen.findByText('22')).toBeInTheDocument();
    expect(
      screen.getByText('19 base + 3 implant = 22', { selector: '.sr-only' })
    ).toBeInTheDocument();
    // Unbonused attributes show the base value plainly.
    expect(screen.getByText('20')).toBeInTheDocument(); // intelligence, no bonus
    // Implants count toward attributes but are not listed on this page.
    expect(screen.queryByText('Ocular Filter - Basic')).not.toBeInTheDocument();
  });

  it('opens the skill comparison drawer from the header, seeded with the active character', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Compare with' }));

    const drawer = await screen.findByRole('dialog', { name: 'Compare skills' });
    expect(
      await within(drawer).findByRole('button', { name: /Pilot One/, pressed: true })
    ).toBeInTheDocument();
  });

  it('opens the drawer on the selection a retired Compare link carried', async () => {
    window.history.pushState({}, '', `/skills/compare?ids=${CHAR_ID}`);
    render(<App />);

    expect(await screen.findByRole('dialog', { name: 'Compare skills' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/skills/trained');
  });

  it('marks a skill already in a Skill Plan on its level bar, regardless of which plan it is in', async () => {
    // Frigate (typeID 2) is trained to III; a plan targets V. The row's
    // context menu can add to *any* of the character's plans (no single
    // "target plan" here — see SkillPlanAdd), so the mark reflects
    // every plan, not just one (issue: the bar gave no indication a skill
    // was already queued anywhere).
    await db.skillPlans.put({
      id: 'plan-1',
      characterId: CHAR_ID,
      name: 'Frigate plan',
      entries: [{ skillTypeID: 2, targetLevel: 5 }],
      remapCount: 0,
      updatedAt: 1,
    });

    render(<App />);

    expect(await screen.findByText('Spaceship Command')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Spaceship Command/ }));

    expect(
      await screen.findByRole('img', { name: 'Level 3 of 5, planned to 5' })
    ).toBeInTheDocument();
  });

  it('recovers an implant attribute bonus from a transient type lookup failure', async () => {
    // loadUniverseType is one live call per implant with no batch to fall
    // back to: without its retry, one transient failure drops the implant's
    // perception bonus from the attribute chip.
    let typeRequests = 0;
    server.use(
      http.get('https://esi.evetech.net/universe/types/9899', () => {
        typeRequests += 1;
        if (typeRequests === 1) return HttpResponse.error();
        return HttpResponse.json({
          type_id: 9899,
          name: 'Ocular Filter - Basic',
          description: 'A basic <b>ocular filter</b> implant.',
          group_id: 300,
          published: true,
          dogma_attributes: [{ attribute_id: 178, value: 3.0 }],
        });
      })
    );

    render(<App />);

    expect(
      await screen.findByText('19 base + 3 implant = 22', { selector: '.sr-only' })
    ).toBeInTheDocument();
  });

  it('detects a cerebral accelerator and shows it as a third term, separate from implants', async () => {
    // A legal base spread (20/20/20/20/19, sums to 99) with a uniform +4
    // booster on every attribute, plus the fixture's own +3 perception
    // implant on top of that. Once the implant comes off, what's left is
    // inflated by exactly +4 everywhere — the signature deriveAttributeBaseline
    // reads as an accelerator.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({
          charisma: 23,
          intelligence: 24,
          memory: 24,
          perception: 27,
          willpower: 24,
        })
      )
    );

    render(<App />);

    // Perception: base 20 + implant 3 + booster 4 = effective 27. The chip
    // shows the total; the terms are the label the hover reveals.
    expect(
      await screen.findByText('20 base + 3 implant + 4 booster = 27', { selector: '.sr-only' })
    ).toBeInTheDocument();
    // Intelligence, memory, willpower: no implant, so the booster is named on
    // its own — applied uniformly.
    expect(screen.getAllByText('20 base + 4 booster = 24', { selector: '.sr-only' })).toHaveLength(
      3
    );
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

  it('marks only the in-progress skill with a "Training → level · time" chip', async () => {
    const day = 86_400_000;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 2,
            queue_position: 0,
            finished_level: 4,
            start_date: new Date(Date.now() - day).toISOString(),
            finish_date: new Date(Date.now() + 4 * day + 60_000).toISOString(),
          },
          {
            skill_id: 2,
            queue_position: 1,
            finished_level: 5,
            start_date: new Date(Date.now() + 4 * day).toISOString(),
            finish_date: new Date(Date.now() + 9 * day).toISOString(),
          },
        ])
      )
    );

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Expand all' }));
    // Level IV is the one training; V is queued behind it and must not show.
    // One chip on the row, one on its group's header.
    expect(await screen.findAllByText(/^Training → IV · 4d 0h$/)).toHaveLength(2);
    expect(screen.queryByText(/Training → V/)).not.toBeInTheDocument();
  });

  it('shows the training chip on the collapsed header of only the group holding it', async () => {
    const day = 86_400_000;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 2,
            queue_position: 0,
            finished_level: 4,
            start_date: new Date(Date.now() - day).toISOString(),
            finish_date: new Date(Date.now() + 4 * day + 60_000).toISOString(),
          },
        ])
      )
    );

    render(<App />);

    const chips = await screen.findAllByText(/^Training → IV · 4d 0h$/);
    expect(chips).toHaveLength(1);
    const header = chips[0].closest('button');
    expect(header).toHaveAttribute('aria-expanded', 'false');
    for (const other of screen
      .getAllByRole('button', { expanded: false })
      .filter((button) => button !== header)) {
      expect(other).not.toHaveTextContent(/Training →/);
    }
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
      fetchedAt: STALE_FETCHED_AT,
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

  it('keeps the saved skills on screen, with a small log-in note, when the grant lapsed over them', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'skills',
      value: skillsPayload,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    render(<App />);

    expect(await screen.findByText(/log in again to refresh/i)).toBeInTheDocument();
    expect(screen.queryByText(/log in again to see skills/i)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Gunnery/ })).toBeInTheDocument();
  });

  it('exports what the list shows in the re-login state, the saved skills', async () => {
    // The invariant: export hands over exactly what the route renders.
    // loadWithCacheStatus still reads the cache on an auth failure ("needsReauth
    // never short-circuits the cache read"), and the route now shows that saved
    // copy under a small note, so the export carries it too. The full banner (and
    // an empty export) is only for a lapsed grant with nothing saved.
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'skills',
      value: skillsPayload,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    render(<App />);

    // The route's own note, not Layout's global auth notice — the latter
    // fires on emitEsiAuthFailure, before the snapshot settles.
    expect(await screen.findByText(/log in again to refresh/i)).toBeInTheDocument();

    const copied: string[] = [];
    configureClipboard(async (text) => {
      copied.push(text);
    });
    try {
      const user = userEvent.setup();
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Export Skills' }), {
        button: 0,
        pointerType: 'mouse',
      });
      (await screen.findByRole('menuitem', { name: 'Copy for Google Sheets / Excel' })).focus();
      await user.keyboard('{Enter}');
      await waitFor(() => expect(copied).toHaveLength(1));
      // The header row and the saved skills.
      expect(copied[0].trim().split('\n').length).toBeGreaterThan(1);
    } finally {
      configureClipboard(null);
    }
  });

  it('shows trained of total on each tile, counting skills the character has not trained', async () => {
    render(<App />);

    // Gunnery has Small Hybrid Turret (trained) and Sharpshooter (not in ESI's skills).
    const gunnery = await screen.findByRole('button', { name: /^Gunnery/ });
    expect(within(gunnery).getByText('1 / 2')).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: /^Spaceship Command/ })).getByText('1 / 1')
    ).toBeInTheDocument();
    // The summary strip carries the overall count.
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('marks a skill ESI does not list as needing its book, with empty pips and no SP', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Gunnery/ }));
    const row = screen.getByRole('button', { name: 'Sharpshooter' });
    expect(within(row).getByText('Need book')).toBeInTheDocument();
    expect(within(row).getByRole('img', { name: 'Level 0 of 5' })).toBeInTheDocument();
    expect(within(row).queryByText(/SP$/)).not.toBeInTheDocument();
    // A trained skill never shows the marker.
    expect(
      within(screen.getByRole('button', { name: 'Small Hybrid Turret' })).queryByText('Need book')
    ).not.toBeInTheDocument();
  });

  it('opens the skill info modal from the skill name and from the rest of the row', async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Spaceship Command/ }));
    const link = screen.getByRole('link', { name: 'Frigate' });
    expect(link).toHaveAttribute('href', expect.stringContaining('info=skill-2'));

    await user.click(screen.getByRole('button', { name: 'Frigate' }));
    await waitFor(() => expect(window.location.search).toContain('info=skill-2'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows the queued level beside the trained one, and queued pips', async () => {
    const day = 86_400_000;
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 2,
            queue_position: 0,
            finished_level: 4,
            start_date: new Date(Date.now() - day).toISOString(),
            finish_date: new Date(Date.now() + 4 * day).toISOString(),
          },
          {
            skill_id: 2,
            queue_position: 1,
            finished_level: 5,
            start_date: new Date(Date.now() + 4 * day).toISOString(),
            finish_date: new Date(Date.now() + 9 * day).toISOString(),
          },
        ])
      )
    );
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Spaceship Command/ }));
    const row = screen.getByRole('button', { name: 'Frigate' });
    expect(within(row).getByText('3 → 5')).toBeInTheDocument();
    expect(
      within(row).getByRole('img', { name: 'Level 3 of 5, planned to 5' })
    ).toBeInTheDocument();
    // The summary strip counts the skill once, not once per queued level.
    expect(screen.getByText('In queue')).toBeInTheDocument();
  });

  it('finds a skill the character has not trained, and expands its group to show it', async () => {
    render(<App />);

    await screen.findByRole('button', { name: /^Gunnery/ });
    fireEvent.change(screen.getByPlaceholderText('Search skills…'), {
      target: { value: 'sharpshooter' },
    });
    expect(await screen.findByText('Need book')).toBeInTheDocument();
    // The tile reports its matches instead of trained / total.
    expect(
      within(screen.getByRole('button', { name: /^Gunnery/ })).getByText('1 match')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Spaceship Command/ })).not.toBeInTheDocument();
    // Still in the tab order while searching: aria-disabled, not disabled.
    const tile = screen.getByRole('button', { name: /^Gunnery/ });
    expect(tile).toHaveAttribute('aria-disabled', 'true');
    expect(tile).toBeEnabled();
  });

  it('announces the match count, and no matches, for a search', async () => {
    const statusTexts = () => screen.getAllByRole('status').map((el) => el.textContent ?? '');
    render(<App />);
    await screen.findByRole('button', { name: /Spaceship Command/ });
    const search = screen.getByPlaceholderText('Search skills…');
    fireEvent.change(search, { target: { value: 'frigate' } });
    await waitFor(() =>
      expect(statusTexts()).toContainEqual(expect.stringMatching(/\d+ skills? match/i))
    );
    fireEvent.change(search, { target: { value: 'zzzqqq' } });
    await waitFor(() => expect(statusTexts()).toContain('No skills match your search.'));
  });

  it('exports only the skills a search leaves on screen', async () => {
    render(<App />);
    await screen.findByRole('button', { name: /Spaceship Command/ });
    fireEvent.change(screen.getByPlaceholderText('Search skills…'), {
      target: { value: 'frigate' },
    });
    await screen.findByRole('button', { name: /^Frigate/ });

    const copied: string[] = [];
    configureClipboard(async (text) => {
      copied.push(text);
    });
    try {
      const user = userEvent.setup();
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Export Skills' }), {
        button: 0,
        pointerType: 'mouse',
      });
      (await screen.findByRole('menuitem', { name: 'Copy for Google Sheets / Excel' })).focus();
      await user.keyboard('{Enter}');
      await waitFor(() => expect(copied).toHaveLength(1));
      const dataLines = copied[0].trim().split('\n').slice(1);
      expect(dataLines.length).toBeGreaterThan(0);
      for (const line of dataLines) expect(line.toLowerCase()).toContain('frigate');
    } finally {
      configureClipboard(null);
    }
  });

  it("shows a selected skill's prerequisites, marking an already-trained one distinct", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Spaceship Command/ }));
    const frigateRow = await screen.findByRole('button', { name: /^Frigate/ });
    fireEvent.click(frigateRow);

    const dialog = await screen.findByRole('dialog');
    const prereqsHeading = await within(dialog).findByText('Prerequisites');
    const prereqsSection = prereqsHeading.closest('section')!;
    // Frigate needs Small Hybrid Turret III; the character has it trained to V.
    expect(within(prereqsSection).getByText('Small Hybrid Turret')).toBeInTheDocument();
    expect(within(prereqsSection).getByText('Trained · Level 3')).toBeInTheDocument();
  });

  it('shows what a selected skill unlocks, derived from the reverse of prereqs', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Gunnery/ }));
    const turretRow = await screen.findByRole('button', { name: /^Small Hybrid Turret/ });
    fireEvent.click(turretRow);

    const dialog = await screen.findByRole('dialog');
    const unlocksHeading = await within(dialog).findByText('Unlocks');
    const unlocksSection = unlocksHeading.closest('section')!;
    expect(within(unlocksSection).getByText('Frigate')).toBeInTheDocument();
    expect(within(unlocksSection).getByText('Level 3')).toBeInTheDocument();
  });

  it('does not render a tooltip bubble for a skill row with no description', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /^Gunnery/ }));
    const turretRow = await screen.findByRole('button', { name: /^Small Hybrid Turret/ });
    expect(turretRow.closest('li')?.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('offers Add to Skill Plan in the skill info modal, not on the row', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Spaceship Command/ }));
    expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /^Frigate/ }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Create Skill Plan and add' })
    );
    expect(await within(dialog).findByRole('button', { name: 'Undo' })).toBeInTheDocument();
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

  it('keeps the group search in the URL, and restores it on a fresh visit', async () => {
    const { unmount } = render(<App />);
    await screen.findByText('Gunnery');

    const search = screen.getByPlaceholderText('Search skills…');
    fireEvent.change(search, { target: { value: 'frigate' } });
    await screen.findByText('Frigate');
    await waitFor(() => expect(window.location.search).toContain('groupSearch=frigate'));

    unmount();
    render(<App />);
    expect(await screen.findByText('Frigate')).toBeInTheDocument();
    expect(screen.queryByText('Gunnery')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search skills…')).toHaveValue('frigate');
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
