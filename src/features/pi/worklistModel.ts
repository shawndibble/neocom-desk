/**
 * Every colony's instructions, flattened into one ranked list.
 *
 * ## Why the cards became a list
 *
 * The tab used to be a grid of planet cards, each carrying its own `Do this`
 * and `Build up to` sections. Every card was individually correct and the page
 * still failed the question it exists to answer: with six colonies on screen,
 * finding the two things worth doing meant reading six cards and comparing
 * figures that were never presented side by side. Worse, the two sections on
 * one card measured different things — one an increment on the running
 * colony, the other a from-scratch rebuild — with nothing saying so, so a card
 * could tell a pilot to add factories *and* to tear the colony down, and leave
 * them to work out which was better.
 *
 * So the instructions leave the cards and become one list, ranked by what each
 * step is worth across every planet at once. The planet becomes a column.
 *
 * ## Two lists, because two bases
 *
 * `tuning` and `rebuilds` come back separately and are never concatenated.
 * A tuning step is a gain over what the colony earns now, and tuning steps add
 * up. A rebuild is what the planet would earn *instead*, rebuilt around a
 * different resource, and adding it to the steps above it is meaningless —
 * they are alternatives, measured from the same starting point. Returning one
 * list with a flag would leave every caller free to sum it; returning two
 * makes the mistake impossible to make by accident.
 *
 * ## What ranks where, and why
 *
 * 1. **An overflowing colony leads, whatever it is worth.** A colony that
 *    fills its Launchpad before the pilot comes back stops extracting, so
 *    every other figure the page prints for it is being thrown away. There is
 *    no point tuning a colony that is standing still.
 * 2. **Then steps that earn**, by ISK an hour, across planets.
 * 3. **Then a removal whose freed budget buys extraction**, ranked by how many
 *    starved facilities that extraction would feed. It earns — but what those
 *    units are finally worth depends on which facility they reach and what it
 *    makes, and this model has not walked that chain. Ranking it on a priced
 *    figure it does not have would be inventing one, so it ranks below every
 *    step that *does* have one, on an integer it genuinely has. The removal and
 *    the extraction it pays for stay adjacent, because "remove these four"
 *    without "and put eight heads in their place" is half an instruction.
 * 4. **Last, a removal that buys nothing.** Idle facilities hold CPU and
 *    Powergrid for no return, so pulling them is real — but it earns nothing,
 *    and a step that earns must out-rank it. It is not dropped and it is not
 *    treated as zero ISK, either of which would misrepresent it.
 */
import type { PlanetType } from '@/esi/endpoints';
import type { PinCounts, PinLoad } from '@/engine/pi/types';

export type WorklistVerb = 'haul' | 'remove' | 'add' | 'swap' | 'rebuild';

/** One thing to go and do, on one planet. */
export interface WorklistRow {
  /** Stable across refreshes: planet, verb and what it acts on. */
  key: string;
  verb: WorklistVerb;
  planetId: number;
  planetName: string | null;
  planetType: PlanetType;
  /** What the step acts on, already named — "8 extractor heads", "Biocells". */
  label: string;
  /**
   * ISK an hour this step is worth. **Null means the step's value is not
   * money** — a removal frees CPU and Powergrid — never that it is worth
   * nothing. Renderers must show `freed` in its place rather than a zero.
   */
  iskPerHour: number | null;
  /** CPU and Powergrid a removal hands back. Only ever set on a `remove` row. */
  freed?: PinLoad;
  /** How many pins the step adds or removes, where it is a pin count. */
  pinCount?: number;
  /** On a `haul` row: what the colony can hold, against what the pilot's cadence needs. */
  window?: { hoursToFull: number; haulHours: number };
  /** On a `rebuild` row: the tier and the pins the layout is made of. */
  tier?: number;
  pins?: PinCounts;
  /** On the `add` row a removal pays for: the extraction it buys, and what that feeds. */
  heads?: number;
  unitsPerHour?: number;
  wouldFeed?: number;
}

export interface Worklist {
  /** Steps that leave the colony standing. These add up. */
  tuning: WorklistRow[];
  /** What a planet would earn rebuilt instead. These do not add to anything. */
  rebuilds: WorklistRow[];
}

/** A step the network plan wants placed here. */
export interface WorklistOpportunity {
  label: string;
  marginPerHour: number;
}

/** What this colony's idle facilities are holding, and what pulling them buys. */
export interface WorklistIdle {
  pinCount: number;
  freed: PinLoad;
  /**
   * The extraction the freed budget pays for, already sized by
   * `extractionUpgrade`. Null when it buys nothing that fits.
   *
   * Deliberately carries no ISK figure. `ExtractionUpgrade` reports heads and
   * units, and what those units are finally worth depends on which of the
   * starved facilities they end up feeding and what that facility makes —
   * a chain this model has not walked. Pricing the raw P0 instead would be a
   * number that looks derived and is not, which is the one thing this tab
   * must not print. So the row is ranked on facilities fed, an integer the
   * model actually has.
   */
  enables: { heads: number; unitsPerHour: number; resource: string; wouldFeed: number } | null;
}

/** What the colony would earn rebuilt around one resource. */
export interface WorklistRebuild {
  label: string;
  tier: number;
  marginPerHour: number;
  /**
   * The pins the fitted layout is built from. A tier and a product name say
   * what the planet would make; they do not say what a pilot would have to go
   * and place, which is the difference between a score and an instruction.
   *
   * Counts rather than a formatted string: naming a pin is i18n's job, and
   * this module has no `t` and should not grow one.
   */
  pins: PinCounts;
}

/** How long this colony lasts before it fills, against how long it is left. */
export interface WorklistThroughput {
  /**
   * Hours until the Launchpad and Storage are full. **Null when the colony's
   * flow cannot be measured** — which is "we cannot see", not "it is fine",
   * and must never be read as a buffer that lasts.
   */
  hoursToFull: number | null;
  haulHours: number;
  /** What standing still costs, per hour of the window it spends full. */
  lostIskPerHour: number;
}

export interface WorklistColony {
  planetId: number;
  name: string | null;
  planetType: PlanetType;
  idle: WorklistIdle | null;
  opportunities: readonly WorklistOpportunity[];
  conversions: readonly WorklistOpportunity[];
  rebuild: WorklistRebuild | null;
  throughput: WorklistThroughput | null;
}

/**
 * Rank bands. An overflowing colony sorts above everything and a valueless
 * removal below it, whatever the ISK figures are, so the two cannot be
 * shuffled into the middle by a large or small margin elsewhere.
 */
const BAND = { overflow: 0, earning: 1, feeds: 2, freesOnly: 3 } as const;

interface Ranked {
  band: number;
  isk: number;
  row: WorklistRow;
  /** Emitted immediately after `row`, sharing its rank. */
  follows?: WorklistRow;
}

function base(colony: WorklistColony) {
  return {
    planetId: colony.planetId,
    planetName: colony.name,
    planetType: colony.planetType,
  };
}

function rankColony(colony: WorklistColony): Ranked[] {
  const out: Ranked[] = [];
  const { planetId } = colony;

  // 1. Standing still beats every other fault on this planet.
  const flow = colony.throughput;
  if (flow && flow.hoursToFull !== null && flow.hoursToFull < flow.haulHours) {
    out.push({
      band: BAND.overflow,
      isk: flow.lostIskPerHour,
      row: {
        ...base(colony),
        key: `${planetId}:haul`,
        verb: 'haul',
        label: colony.name ?? String(planetId),
        iskPerHour: flow.lostIskPerHour,
        window: { hoursToFull: flow.hoursToFull, haulHours: flow.haulHours },
      },
    });
  }

  // 2. Idle facilities, and whatever their budget pays for — one rank, two rows.
  if (colony.idle) {
    const { pinCount, freed, enables } = colony.idle;
    const remove: WorklistRow = {
      ...base(colony),
      key: `${planetId}:remove`,
      verb: 'remove',
      label: colony.name ?? String(planetId),
      iskPerHour: null,
      freed,
      pinCount,
    };
    out.push(
      enables
        ? {
            // Below every step with a real ISK figure and above a removal that
            // buys nothing: it earns, but by how much this model cannot say.
            band: BAND.feeds,
            isk: enables.wouldFeed,
            row: remove,
            follows: {
              ...base(colony),
              key: `${planetId}:add:freed`,
              verb: 'add',
              label: enables.resource,
              iskPerHour: null,
              heads: enables.heads,
              unitsPerHour: enables.unitsPerHour,
              wouldFeed: enables.wouldFeed,
            },
          }
        : { band: BAND.freesOnly, isk: 0, row: remove }
    );
  }

  for (const line of colony.opportunities) {
    out.push({
      band: BAND.earning,
      isk: line.marginPerHour,
      row: {
        ...base(colony),
        key: `${planetId}:add:${line.label}`,
        verb: 'add',
        label: line.label,
        iskPerHour: line.marginPerHour,
      },
    });
  }

  for (const line of colony.conversions) {
    out.push({
      band: BAND.earning,
      isk: line.marginPerHour,
      row: {
        ...base(colony),
        key: `${planetId}:swap:${line.label}`,
        verb: 'swap',
        label: line.label,
        iskPerHour: line.marginPerHour,
      },
    });
  }

  return out;
}

export function buildWorklist(colonies: readonly WorklistColony[]): Worklist {
  const ranked = colonies.flatMap(rankColony);
  // Band first, then ISK, then planet — the last so a refresh that leaves two
  // equal steps in a different order does not reshuffle the list under a
  // pilot who is halfway down it.
  ranked.sort((a, b) => a.band - b.band || b.isk - a.isk || a.row.planetId - b.row.planetId);

  const tuning = ranked.flatMap((entry) =>
    entry.follows ? [entry.row, entry.follows] : [entry.row]
  );

  const rebuilds = colonies
    .filter(
      (colony): colony is WorklistColony & { rebuild: WorklistRebuild } => colony.rebuild !== null
    )
    .map((colony): WorklistRow => ({
      ...base(colony),
      key: `${colony.planetId}:rebuild`,
      verb: 'rebuild',
      label: colony.rebuild.label,
      iskPerHour: colony.rebuild.marginPerHour,
      tier: colony.rebuild.tier,
      pins: colony.rebuild.pins,
    }))
    .sort((a, b) => (b.iskPerHour ?? 0) - (a.iskPerHour ?? 0) || a.planetId - b.planetId);

  return { tuning, rebuilds };
}
