import { useState } from 'react';
import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { ESI_BASE_URL } from '@/esi/client';
import { ItemDetailModal } from './ItemDetailModal';
import { loadAttributeDictionary, loadGlobalMarkets } from '@/sde/loadMarketSde';
import { loadPi, loadSkillAttributeModifiers, loadSkills } from '@/sde/loadSde';
import { piFixture } from '@/sde/__fixtures__/pi';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { clearOrderBookCache } from './orderBook';
import type { RegionOrder } from '@/esi/endpoints';

/** Jita/The Forge, the default Trade Hub the modal falls back to unhydrated. */
const JITA_REGION_ID = 10000002;

vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(),
  loadGlobalMarkets: vi.fn(async () => []),
}));
vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadSkillAttributeModifiers: vi.fn(async () => ({})),
}));

const mockedLoadDictionary = vi.mocked(loadAttributeDictionary);
const mockedLoadGlobalMarkets = vi.mocked(loadGlobalMarkets);
const mockedLoadSkills = vi.mocked(loadSkills);
const mockedLoadPi = vi.mocked(loadPi);
const mockedLoadSkillAttributeModifiers = vi.mocked(loadSkillAttributeModifiers);

const TYPE_ID = 587;

const server = setupServer(
  // Default: no orders anywhere. Individual price tests override with `server.use`.
  http.get(`${ESI_BASE_URL}/markets/:regionId/orders`, () => HttpResponse.json([]))
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(async () => {
  server.resetHandlers();
  vi.clearAllMocks();
  // Group names are cached under the global sentinel and would otherwise
  // leak a resolved name into the next test's "unresolvable" case.
  await db.esiCache.clear();
  await db.skillPlans.clear();
  // Order Book has its own 300s TTL cache, keyed by region+type — several
  // tests reuse TYPE_ID, and a real Date.now would let one test's response
  // leak into the next's.
  clearOrderBookCache();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
});

describe('ItemDetailModal', () => {
  it('shows a loading state while ESI and the attribute dictionary are in flight', () => {
    server.use(http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () => new Promise(() => {})));
    mockedLoadDictionary.mockReturnValue(new Promise(() => {}));
    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an error state inside the modal, not an empty shell, when ESI fails', async () => {
    server.use(http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () => HttpResponse.error()));
    mockedLoadDictionary.mockResolvedValue({});
    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);
    expect(await screen.findByText("Couldn't load item info")).toBeInTheDocument();
  });

  it('shows the item name, volume, description and grouped attributes on success', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Rifter',
          description: 'A rugged little frigate.',
          group_id: 25,
          published: true,
          volume: 27289,
          dogma_attributes: [
            { attribute_id: 9, value: 1200 },
            { attribute_id: 37, value: 250 },
            { attribute_id: 99999, value: 42 }, // no dictionary entry — must be skipped
          ],
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
      37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel' },
    });
    mockedLoadSkills.mockResolvedValue([]);

    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);

    expect(await screen.findByText('A rugged little frigate.')).toBeInTheDocument();
    expect(screen.getByText('Volume: 27,289 m3')).toBeInTheDocument();
    expect(screen.getByText('Structure')).toBeInTheDocument();
    expect(screen.getByText('Structure Hitpoints')).toBeInTheDocument();
    expect(screen.getByText('1,200 HP')).toBeInTheDocument();
    expect(screen.getByText('Speed and Travel')).toBeInTheDocument();
    expect(screen.getByText('Maximum Velocity')).toBeInTheDocument();
    expect(screen.getByText('250 m/sec')).toBeInTheDocument();
  });

  it('shows a groupID attribute as the Group name, not "483 groupID"', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Modulated Deep Core Miner II',
          description: '',
          group_id: 54,
          published: true,
          volume: 5,
          dogma_attributes: [{ attribute_id: 137, value: 483 }],
        })
      ),
      http.get(`${ESI_BASE_URL}/universe/groups/483`, () =>
        HttpResponse.json({
          group_id: 483,
          name: 'Mining Laser',
          category_id: 7,
          published: true,
          types: [],
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      137: { name: 'Used with (Launcher Group)', unit: 'groupID', category: 'Miscellaneous' },
    });
    mockedLoadSkills.mockResolvedValue([]);

    render(<ItemDetailModal typeId={TYPE_ID} itemName="Miner" onClose={() => {}} />);

    expect(await screen.findByText('Mining Laser')).toBeInTheDocument();
    expect(screen.queryByText(/groupID/)).not.toBeInTheDocument();
  });

  it('leaves a group it cannot name as the raw value it shows today', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Modulated Deep Core Miner II',
          description: '',
          group_id: 54,
          published: true,
          volume: 5,
          dogma_attributes: [{ attribute_id: 137, value: 99999 }],
        })
      ),
      http.get(
        `${ESI_BASE_URL}/universe/groups/99999`,
        () => new HttpResponse(null, { status: 404 })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      137: { name: 'Used with (Launcher Group)', unit: 'groupID', category: 'Miscellaneous' },
    });
    mockedLoadSkills.mockResolvedValue([]);

    render(<ItemDetailModal typeId={TYPE_ID} itemName="Miner" onClose={() => {}} />);

    expect(await screen.findByText('99999 groupID')).toBeInTheDocument();
  });

  it('shows an attributeID attribute as the attribute it names, using the dictionary alone', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Cybernetic Subprocessor',
          description: '',
          group_id: 300,
          published: true,
          volume: 1,
          dogma_attributes: [{ attribute_id: 180, value: 165 }],
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      180: { name: 'Primary attribute', unit: 'attributeID', category: 'Miscellaneous' },
      165: { name: 'Intelligence', unit: 'points', category: 'Miscellaneous' },
    });
    mockedLoadSkills.mockResolvedValue([]);

    render(<ItemDetailModal typeId={TYPE_ID} itemName="Implant" onClose={() => {}} />);

    expect(await screen.findByText('Intelligence')).toBeInTheDocument();
    expect(screen.queryByText(/attributeID/)).not.toBeInTheDocument();
  });

  it('shows an enum-legend attribute as the member it names, not "1 1=True 0=False"', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Ubiquitous Moon Mining Crystal Type A I',
          description: '',
          group_id: 25,
          published: true,
          volume: 1,
          dogma_attributes: [
            { attribute_id: 786, value: 1 },
            { attribute_id: 128, value: 3 },
          ],
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      786: { name: 'Crystals Take Damage', unit: '1=True 0=False', category: 'Miscellaneous' },
      128: { name: 'Charge size', unit: '1=small 2=medium 3=l', category: 'Miscellaneous' },
    });
    mockedLoadSkills.mockResolvedValue([]);

    render(
      <ItemDetailModal
        typeId={TYPE_ID}
        itemName="Ubiquitous Moon Mining Crystal Type A I"
        onClose={() => {}}
      />
    );

    expect(await screen.findByText('Crystals Take Damage')).toBeInTheDocument();
    expect(screen.getByText('True')).toBeInTheDocument();
    expect(screen.getByText('Large')).toBeInTheDocument();
    expect(screen.queryByText(/1=True 0=False/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1=small/)).not.toBeInTheDocument();
  });

  it('renders description markup as formatting instead of literal tags, and resolves required skills to names', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Brand Manager Expert System',
          description:
            '<font size="14"><b>Brand Manager Expert System</b></font>\n\nGrants access.',
          group_id: 25,
          published: true,
          volume: 0.1,
          dogma_attributes: [
            { attribute_id: 182, value: 24241 },
            { attribute_id: 277, value: 3 },
          ],
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      182: { name: 'Primary Skill required', unit: 'typeID', category: 'Required Skills' },
    });
    mockedLoadSkills.mockResolvedValue([
      {
        typeID: 24241,
        name: 'Caldari Frigate',
        description: '',
        groupID: 0,
        groupName: '',
        rank: 1,
        primaryAttr: 'perception',
        secondaryAttr: 'willpower',
        prereqs: [],
      },
    ]);

    render(
      <ItemDetailModal typeId={TYPE_ID} itemName="Brand Manager Expert System" onClose={() => {}} />
    );

    expect(
      await screen.findByText('Brand Manager Expert System', { selector: 'b' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/<font/)).not.toBeInTheDocument();
    // The generic "Primary Skill required" row is folded into the dedicated
    // Required Skills section instead of also rendering here.
    expect(screen.queryByText('Primary Skill required')).not.toBeInTheDocument();
    expect(screen.getByText('Required Skills')).toBeInTheDocument();
    expect(screen.getByText('Caldari Frigate')).toBeInTheDocument();
    // No active Character in this test, so the section degrades to name +
    // level only — no status icon, no Add to Skill Plan.
    expect(screen.getByText('Level 3')).toBeInTheDocument();
    expect(screen.queryByText('Add to Skill Plan')).not.toBeInTheDocument();
  });

  it('with an active Character, shows trained status and Add to Skill Plan creates a plan (issue #1366)', async () => {
    const CHARACTER_ID = 555;
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Brand Manager Expert System',
          description: 'Grants access.',
          group_id: 25,
          published: true,
          volume: 0.1,
          dogma_attributes: [
            { attribute_id: 182, value: 24241 },
            { attribute_id: 277, value: 3 },
          ],
        })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/skills`, () =>
        HttpResponse.json({ skills: [], total_sp: 0, unallocated_sp: 0 })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      182: { name: 'Primary Skill required', unit: 'typeID', category: 'Required Skills' },
    });
    mockedLoadSkills.mockResolvedValue([
      {
        typeID: 24241,
        name: 'Caldari Frigate',
        description: '',
        groupID: 0,
        groupName: '',
        rank: 1,
        primaryAttr: 'perception',
        secondaryAttr: 'willpower',
        prereqs: [],
      },
    ]);
    const user = userEvent.setup();

    render(
      <ItemDetailModal typeId={TYPE_ID} itemName="Brand Manager Expert System" onClose={() => {}} />
    );

    expect(await screen.findByText('Caldari Frigate')).toBeInTheDocument();
    // Never trained -> the 3-state status icon reads "not trained", not the
    // no-Character degraded "Level 3" text.
    expect(screen.getByLabelText('Not trained')).toBeInTheDocument();

    // No plan yet -> "Create Skill Plan and add" (FitCheck/Mastery's shared label
    // contract, issue #1378).
    await user.click(screen.getByRole('button', { name: 'Create Skill Plan and add' }));

    expect(await screen.findByRole('button', { name: 'Added' })).toBeInTheDocument();
    const plans = await db.skillPlans.where('characterId').equals(CHARACTER_ID).toArray();
    expect(plans).toHaveLength(1);
    expect(plans[0].entries).toEqual([{ skillTypeID: 24241, targetLevel: 3 }]);
  });

  it('shows Added for a required skill already in the target plan, with no click (issue: silent duplicate add)', async () => {
    const CHARACTER_ID = 555;
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    await db.skillPlans.put({
      id: 'plan-1',
      characterId: CHARACTER_ID,
      name: 'Existing plan',
      entries: [{ skillTypeID: 24241, targetLevel: 3 }],
      remapCount: 0,
      updatedAt: 1,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Brand Manager Expert System',
          description: 'Grants access.',
          group_id: 25,
          published: true,
          volume: 0.1,
          dogma_attributes: [
            { attribute_id: 182, value: 24241 },
            { attribute_id: 277, value: 3 },
          ],
        })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/skills`, () =>
        HttpResponse.json({ skills: [], total_sp: 0, unallocated_sp: 0 })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      182: { name: 'Primary Skill required', unit: 'typeID', category: 'Required Skills' },
    });
    mockedLoadSkills.mockResolvedValue([
      {
        typeID: 24241,
        name: 'Caldari Frigate',
        description: '',
        groupID: 0,
        groupName: '',
        rank: 1,
        primaryAttr: 'perception',
        secondaryAttr: 'willpower',
        prereqs: [],
      },
    ]);

    render(
      <ItemDetailModal typeId={TYPE_ID} itemName="Brand Manager Expert System" onClose={() => {}} />
    );

    expect(await screen.findByText('Caldari Frigate')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Added' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to Skill Plan' })).not.toBeInTheDocument();
  });

  it('attribute modifier chip: shows which skill affects it and adds it to a plan (issue #1372)', async () => {
    const CHARACTER_ID = 777;
    const GUNNERY_TYPE_ID = 3300;
    const SHARPSHOOTER_TYPE_ID = 3311;
    const OPTIMAL_RANGE_ATTR = 54;
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: '1400mm Autocannon II',
          description: '',
          group_id: 55,
          published: true,
          volume: 5,
          dogma_attributes: [
            // Requires Gunnery I — the gate the Sharpshooter bonus checks.
            { attribute_id: 182, value: GUNNERY_TYPE_ID },
            { attribute_id: 277, value: 1 },
            { attribute_id: OPTIMAL_RANGE_ATTR, value: 12000 },
          ],
        })
      ),
      // No token provider configured (configureEsi runs only from App.tsx's
      // real boot) -> /skills always degrades to empty here; untrained is
      // the reachable case in this test environment.
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/skills`, () =>
        HttpResponse.json({ skills: [], total_sp: 0, unallocated_sp: 0 })
      )
    );
    mockedLoadDictionary.mockResolvedValue({
      182: { name: 'Primary Skill required', unit: 'typeID', category: 'Required Skills' },
      [OPTIMAL_RANGE_ATTR]: { name: 'Optimal Range', unit: 'm', category: 'Targeting' },
    });
    mockedLoadSkills.mockResolvedValue([
      {
        typeID: GUNNERY_TYPE_ID,
        name: 'Gunnery',
        description: '',
        groupID: 0,
        groupName: '',
        rank: 1,
        primaryAttr: 'perception',
        secondaryAttr: 'willpower',
        prereqs: [],
      },
      {
        typeID: SHARPSHOOTER_TYPE_ID,
        name: 'Sharpshooter',
        description: '',
        groupID: 0,
        groupName: '',
        rank: 1,
        primaryAttr: 'perception',
        secondaryAttr: 'willpower',
        prereqs: [],
      },
    ]);
    mockedLoadSkillAttributeModifiers.mockResolvedValue({
      [OPTIMAL_RANGE_ATTR]: [
        {
          ownerSkillTypeID: SHARPSHOOTER_TYPE_ID,
          gatingSkillTypeID: GUNNERY_TYPE_ID,
          perLevelValue: 5,
        },
      ],
    });
    const user = userEvent.setup();

    render(<ItemDetailModal typeId={TYPE_ID} itemName="1400mm Autocannon II" onClose={() => {}} />);

    const chip = await screen.findByRole('button', { name: '12,000 m' });
    await user.click(chip);

    const skillLine = await screen.findByText('Sharpshooter: +5% per level');
    const popoverContent = skillLine.closest('div') as HTMLElement;
    expect(within(popoverContent).getByText('Not trained')).toBeInTheDocument();

    // Zero plans yet -> "Create Skill Plan and add", matching FitCheckPanel/MasteryPanel's
    // convention. The item's own Required Skills section also has a button
    // here (for Gunnery) — scope to this popover's own button.
    await user.click(
      within(popoverContent).getByRole('button', { name: 'Create Skill Plan and add' })
    );

    await waitFor(async () => {
      const plans = await db.skillPlans.where('characterId').equals(CHARACTER_ID).toArray();
      expect(plans).toHaveLength(1);
      // Untrained -> "Add to Plan" trains one level, same convention as
      // SkillRowContextMenu's `Math.min(currentLevel + 1, 5)`.
      expect(plans[0].entries).toEqual([{ skillTypeID: SHARPSHOOTER_TYPE_ID, targetLevel: 1 }]);
    });
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Rifter',
          description: '',
          group_id: 25,
          published: true,
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({});
    mockedLoadSkills.mockResolvedValue([]);

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => setOpen(false)} />
          )}
        </>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Rifter' })).toBeInTheDocument());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});

describe('ItemDetailModal planetary production', () => {
  const REACTIVE_METALS = 2398;
  const SCHEMATICS = piFixture({
    schematics: {
      '2398': {
        schematicId: 133,
        name: 'Reactive Metals',
        cycleTime: 1800,
        quantity: 20,
        volume: 0.19,
        facility: 'basic',
        planetTypes: ['barren', 'lava', 'plasma'],
        inputs: [{ typeID: 2267, quantity: 3000, name: 'Base Metals' }],
      },
    },
    raw: [
      {
        typeID: 2267,
        name: 'Base Metals',
        volume: 0.005,
        planetTypes: ['barren', 'gas', 'lava', 'plasma', 'storm'],
      },
    ],
  });

  function serveType(typeId: number, name: string) {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${typeId}`, () =>
        HttpResponse.json({
          type_id: typeId,
          name,
          description: `${name} description.`,
          group_id: 429,
          published: true,
          volume: 0.38,
          dogma_attributes: [],
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({});
    mockedLoadSkills.mockResolvedValue([]);
  }

  it('shows the schematic that produces a planetary commodity', async () => {
    serveType(REACTIVE_METALS, 'Reactive Metals');
    mockedLoadPi.mockResolvedValue(SCHEMATICS);

    render(
      <ItemDetailModal typeId={REACTIVE_METALS} itemName="Reactive Metals" onClose={() => {}} />
    );

    expect(await screen.findByText('Planetary production')).toBeInTheDocument();
    expect(screen.getByText('20 per 30m cycle')).toBeInTheDocument();
    expect(screen.getByText('3,000 x Base Metals')).toBeInTheDocument();
  });

  it('says a raw resource is extracted rather than made', async () => {
    serveType(2267, 'Base Metals');
    mockedLoadPi.mockResolvedValue(SCHEMATICS);

    render(<ItemDetailModal typeId={2267} itemName="Base Metals" onClose={() => {}} />);

    expect(await screen.findByText('Planetary production')).toBeInTheDocument();
    expect(screen.getByText(/Extracted straight off a planet/)).toBeInTheDocument();
  });

  it('shows no planetary section for an item planetary industry never touches', async () => {
    serveType(587, 'Rifter');
    mockedLoadPi.mockResolvedValue(SCHEMATICS);

    render(<ItemDetailModal typeId={587} itemName="Rifter" onClose={() => {}} />);

    expect(await screen.findByText('Rifter description.')).toBeInTheDocument();
    expect(screen.queryByText('Planetary production')).not.toBeInTheDocument();
  });

  it('still renders the item when the planetary payload cannot be read', async () => {
    // A missing local payload costs one section, never the ESI-backed detail
    // the modal exists for.
    serveType(REACTIVE_METALS, 'Reactive Metals');
    mockedLoadPi.mockRejectedValue(new Error('offline'));

    render(
      <ItemDetailModal typeId={REACTIVE_METALS} itemName="Reactive Metals" onClose={() => {}} />
    );

    expect(await screen.findByText('Reactive Metals description.')).toBeInTheDocument();
    expect(screen.queryByText('Planetary production')).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load item info")).not.toBeInTheDocument();
  });
});

describe('ItemDetailModal best sell/buy price', () => {
  function order(overrides: Partial<RegionOrder>): RegionOrder {
    return {
      duration: 90,
      is_buy_order: false,
      issued: '2026-01-01T00:00:00Z',
      location_id: 60003760,
      min_volume: 1,
      order_id: 1,
      price: 100,
      range: 'region',
      system_id: 30000142,
      type_id: TYPE_ID,
      volume_remain: 10,
      volume_total: 10,
      ...overrides,
    };
  }

  function serveRifter() {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/types/${TYPE_ID}`, () =>
        HttpResponse.json({
          type_id: TYPE_ID,
          name: 'Rifter',
          description: '',
          group_id: 25,
          published: true,
          volume: 27289,
          dogma_attributes: [],
        })
      )
    );
    mockedLoadDictionary.mockResolvedValue({});
    mockedLoadSkills.mockResolvedValue([]);
  }

  it("shows the region's best sell and buy price", async () => {
    serveRifter();
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${JITA_REGION_ID}/orders`, () =>
        HttpResponse.json([
          order({ order_id: 1, is_buy_order: false, price: 500_000 }),
          order({ order_id: 2, is_buy_order: false, price: 450_000 }),
          order({ order_id: 3, is_buy_order: true, price: 400_000 }),
          order({ order_id: 4, is_buy_order: true, price: 420_000 }),
        ])
      )
    );

    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);

    // Shorthand on screen (#947); the exact figure is the accessible name.
    expect(await screen.findByText('450,000.00 ISK', { selector: '.sr-only' })).toBeInTheDocument();
    expect(screen.getByText('420,000.00 ISK', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('shows a dash for a side with no orders', async () => {
    serveRifter();
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${JITA_REGION_ID}/orders`, () =>
        HttpResponse.json([order({ order_id: 1, is_buy_order: false, price: 500_000 })])
      )
    );

    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);

    expect(await screen.findByText('500,000.00 ISK', { selector: '.sr-only' })).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it("prices at the Trade Hub's own station, the same answer the Compare Drawer gives", async () => {
    serveRifter();
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${JITA_REGION_ID}/orders`, () =>
        HttpResponse.json([
          order({ order_id: 1, price: 500_000, location_id: 60003760 }),
          // Cheaper, but in Perimeter — outside the hub station.
          order({ order_id: 2, price: 300_000, location_id: 60000004 }),
        ])
      )
    );

    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);

    expect(await screen.findByText('500,000.00 ISK', { selector: '.sr-only' })).toBeInTheDocument();
    expect(screen.queryByText('300,000.00 ISK', { selector: '.sr-only' })).not.toBeInTheDocument();
  });

  it('reads every station in the region when handed a Region-mode location', async () => {
    serveRifter();
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${JITA_REGION_ID}/orders`, () =>
        HttpResponse.json([
          order({ order_id: 1, price: 500_000, location_id: 60003760 }),
          order({ order_id: 2, price: 300_000, location_id: 60000004 }),
        ])
      )
    );

    render(
      <ItemDetailModal
        typeId={TYPE_ID}
        itemName="Rifter"
        onClose={() => {}}
        location={{
          mode: 'region',
          regionId: JITA_REGION_ID,
          hubStationId: 60003760,
          globalMarkets: new Map(),
        }}
      />
    );

    expect(await screen.findByText('300,000.00 ISK', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('reads a Global Market Region item from its own region', async () => {
    serveRifter();
    mockedLoadGlobalMarkets.mockResolvedValueOnce([
      { typeId: TYPE_ID, regionId: 19000001, regionName: 'Global PLEX Market' },
    ]);
    server.use(
      http.get(`${ESI_BASE_URL}/markets/19000001/orders`, () =>
        HttpResponse.json([order({ order_id: 1, price: 4_000_000, location_id: 60003760 })])
      )
    );

    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);

    expect(
      await screen.findByText('4,000,000.00 ISK', { selector: '.sr-only' })
    ).toBeInTheDocument();
  });

  it('hides the price row rather than blanking the modal when the order book fetch fails', async () => {
    serveRifter();
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${JITA_REGION_ID}/orders`, () => HttpResponse.error())
    );

    render(<ItemDetailModal typeId={TYPE_ID} itemName="Rifter" onClose={() => {}} />);

    expect(await screen.findByText('Volume: 27,289 m3')).toBeInTheDocument();
    // The row shows a placeholder while the book is in flight, then drops out.
    await waitFor(() => expect(screen.queryByText('Best sell:')).not.toBeInTheDocument());
  });
});
