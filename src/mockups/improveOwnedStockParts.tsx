import { useId, useState, type ReactNode } from 'react';
import {
  Button,
  Caret,
  Checkbox,
  Eyebrow,
  FilterChip,
  IconButton,
  IskAmount,
  IskInput,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  StatChange,
} from '@/components/ui';
import { Collapse } from '@/components/ui/Collapse';
import { Pill } from '@/components/ui/Pill';
import { inlineLinkClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { textActionClassName } from '@/components/ui/textActionClassName';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import type { StatChange as StatChangeValue } from '@/engine/fittings/variationDelta';
import { NewComponent } from './NewComponent';

/** Q1: where "Count what I own" lives. */
export type Placement = 'settings' | 'top';
/** Q2: the place as Appraisal's picker, or as a sentence that names where to change it. */
export type PlaceMode = 'picker' | 'text';
/** Q3: "You own 5 of 8" replaces the row's cost line, or sits beside it. */
export type NoteMode = 'replace' | 'beside';
/** The stock read: some owned at the place, or nothing there. */
export type StockState = 'some' | 'noneHere';

const SHIP = 'Drake · L4 Missions';
const PLACES = [
  { id: 'jita', label: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', short: 'Jita IV-4' },
  { id: 'amarr', label: 'Amarr VIII (Oris) - Emperor Family Academy', short: 'Amarr VIII' },
  { id: 'home', label: 'Efa - Home Sweet Home (Astrahus)', short: 'Efa Astrahus' },
] as const;

interface MockRow {
  id: string;
  swap: string;
  gain: string;
  changes: readonly StatChangeValue[];
  /** Copies the swap needs, and how many the pilot holds at the place. */
  need: number;
  own: number;
  /** Sell price of one copy. */
  each: number;
}

const NO_DOWNSIDE: readonly MockRow[] = [
  {
    id: 'launchers',
    swap: '6× Heavy Assault Missile Launcher II → Caldari Navy Heavy Assault Missile Launcher',
    gain: '+5.1%',
    changes: [
      { key: 'totalDps', before: 615.8, after: 647.5 },
      { key: 'cpuUsed', before: 584.8, after: 576.1 },
    ],
    need: 6,
    own: 6,
    each: 41_800_000,
  },
  {
    id: 'bcs',
    swap: '2× Ballistic Control System II → Republic Fleet Ballistic Control System',
    gain: '+4.5%',
    changes: [
      { key: 'totalDps', before: 615.8, after: 644.9 },
      { key: 'cpuUsed', before: 584.8, after: 552.8 },
    ],
    need: 2,
    own: 1,
    each: 113_450_000,
  },
  {
    id: 'hardener',
    swap: 'Multispectrum Shield Hardener II → Dread Guristas Multispectrum Shield Hardener',
    gain: '+3.0%',
    changes: [{ key: 'ehp', before: 55_480, after: 58_877 }],
    need: 1,
    own: 0,
    each: 235_200_000,
  },
];

const TRADE_OFFS: readonly MockRow[] = [
  {
    id: 'lse',
    swap: '3× Large Shield Extender II → Caldari Navy Large Shield Extender',
    gain: '+2.6%',
    changes: [
      { key: 'ehp', before: 55_480, after: 56_916 },
      { key: 'signatureRadius', before: 236, after: 244 },
    ],
    need: 3,
    own: 1,
    each: 28_100_000,
  },
];

/** Owned copies once the place holds nothing: the "none here" state. */
const ownedIn = (row: MockRow, state: StockState) => (state === 'noneHere' ? 0 : row.own);

/** What the row still costs: only the copies the pilot lacks. */
const toBuy = (row: MockRow, state: StockState) =>
  Math.max(0, row.need - ownedIn(row, state)) * row.each;

const placeOf = (id: string) => PLACES.find((p) => p.id === id) ?? PLACES[0];

/** Appraisal's own sentence, "Minus what I own at [place]", on the shared pick. */
function PlacePicker({ place, setPlace }: { place: string; setPlace: (id: string) => void }) {
  return (
    <Select value={place} onValueChange={setPlace}>
      <SelectTrigger size="sm" className="w-auto max-w-full" aria-label="Place for owned stock">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">any location</SelectItem>
        <SelectSeparator />
        {PLACES.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.short}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * "Count what I own": a checkbox like Appraisal's "Minus what I own at", then
 * the place as Appraisal's picker (`picker`) or a sentence naming where it is
 * changed (`text`). Hidden entirely without the assets scope.
 */
function OwnedControl({
  placeMode,
  state,
  on,
  setOn,
  place,
  setPlace,
}: {
  placeMode: PlaceMode;
  state: StockState;
  on: boolean;
  setOn: (on: boolean) => void;
  place: string;
  setPlace: (id: string) => void;
}) {
  const where = place === 'all' ? 'any of your locations' : placeOf(place).label;
  return (
    <NewComponent name="OwnedStockControl">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
            <Checkbox checked={on} onChange={(e) => setOn(e.target.checked)} />
            {placeMode === 'picker' ? 'Count what I own at' : 'Count what I own'}
          </label>
          {placeMode === 'picker' && <PlacePicker place={place} setPlace={setPlace} />}
        </div>
        {on && placeMode === 'text' && state === 'some' && (
          <p className="text-text-dim text-xs">
            Counting what you own at {where}. The place is Appraisal&apos;s Minus owned setting.{' '}
            <a href="#appraisal" className={inlineLinkClassName}>
              Change it
            </a>
          </p>
        )}
        {on && state === 'noneHere' && (
          <p className="text-warning text-xs">
            You own none of these modules at {where}.{' '}
            {placeMode === 'picker' ? (
              'Pick another place, or any location.'
            ) : (
              <>
                The place is Appraisal&apos;s Minus owned setting.{' '}
                <a href="#appraisal" className={inlineLinkClassName}>
                  Change it
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </NewComponent>
  );
}

function CostLine({
  row,
  note,
  counting,
  state,
}: {
  row: MockRow;
  note: NoteMode;
  counting: boolean;
  state: StockState;
}) {
  const own = counting ? ownedIn(row, state) : 0;
  const cost = counting ? toBuy(row, state) : row.need * row.each;
  const all = own >= row.need;
  if (own === 0) {
    return (
      <span className="block text-xs">
        Costs <IskAmount value={cost} />
      </span>
    );
  }
  if (note === 'replace') {
    return (
      <NewComponent name="OwnedCostLine">
        <span className="block text-xs">
          {all ? (
            <>
              <span className="text-success">You own all {row.need}</span>
              <span className="text-text-dim"> · nothing to buy</span>
            </>
          ) : (
            <>
              You own {own} of {row.need} · buy {row.need - own} for <IskAmount value={cost} />
            </>
          )}
        </span>
      </NewComponent>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      {all ? (
        <span className="text-text-dim">Costs nothing</span>
      ) : (
        <span>
          Costs <IskAmount value={cost} />
        </span>
      )}
      <Pill tone={all ? 'success' : 'neutral'}>
        {all ? `Own all ${row.need}` : `Own ${own} of ${row.need}`}
      </Pill>
    </span>
  );
}

function ResultRow({
  row,
  ticked,
  onTick,
  note,
  counting,
  state,
}: {
  row: MockRow;
  ticked: boolean;
  onTick: () => void;
  note: NoteMode;
  counting: boolean;
  state: StockState;
}) {
  return (
    <li className="border-line rounded-xs border">
      <label className={cx('flex items-start gap-3 px-3 py-2', tappableRowClassName)}>
        <Checkbox checked={ticked} onChange={onTick} className="mt-0.5" />
        <span className="min-w-0 flex-1 space-y-0.5 text-sm">
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">{row.swap}</span>
            <span className="text-success shrink-0 text-xs">{row.gain}</span>
          </span>
          <span className="block text-xs">
            {row.changes.map((c, i) => (
              <span key={c.key}>
                {i > 0 && ', '}
                <StatChange change={c} />
              </span>
            ))}
          </span>
          <CostLine row={row} note={note} counting={counting} state={state} />
        </span>
      </label>
    </li>
  );
}

const settingsLine = (counting: boolean, place: string, budget: string) =>
  [
    'Upgrade',
    'Planning to buy',
    counting ? `minus owned at ${place === 'all' ? 'any location' : placeOf(place).short}` : null,
    budget ? `budget ${budget}` : 'no budget',
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * The drawer after a finished Planning search on a Drake, with today's goal
 * chips, Search settings disclosure and "Now → best found" header. The three
 * questions vary only the owned-stock pieces.
 */
export function OwnedStockBody({
  placement,
  placeMode,
  note,
  state = 'some',
  settingsOpen = false,
}: {
  placement: Placement;
  placeMode: PlaceMode;
  note: NoteMode;
  state?: StockState;
  settingsOpen?: boolean;
}) {
  const [on, setOn] = useState(true);
  const [place, setPlace] = useState<string>(state === 'noneHere' ? 'amarr' : 'jita');
  const [open, setOpen] = useState(settingsOpen);
  const [budget, setBudget] = useState('500m');
  const [sort, setSort] = useState('gain');
  const [ticks, setTicks] = useState<ReadonlySet<string>>(new Set(['launchers', 'bcs']));
  const settingsId = useId();
  const flip = (id: string) =>
    setTicks((t) => {
      const next = new Set(t);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const owned = (
    <OwnedControl
      placeMode={placeMode}
      state={state}
      on={on}
      setOn={setOn}
      place={place}
      setPlace={setPlace}
    />
  );
  const chosen = [...NO_DOWNSIDE, ...TRADE_OFFS].filter((r) => ticks.has(r.id));
  const stillToBuy = chosen.reduce((sum, r) => sum + (on ? toBuy(r, state) : r.need * r.each), 0);
  const list = (rows: readonly MockRow[]) => (
    <ul className="space-y-2">
      {rows.map((r) => (
        <ResultRow
          key={r.id}
          row={r}
          ticked={ticks.has(r.id)}
          onTick={() => flip(r.id)}
          note={note}
          counting={on}
          state={state}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['Best overall', 'More damage', 'Tankier', 'Faster', 'Longer reach', 'Cheaper'].map(
          (g) => (
            <FilterChip key={g} label={g} selected={g === 'Best overall'} onToggle={() => {}} />
          )
        )}
      </div>
      <button type="button" className={textActionClassName('gap-1')}>
        More goals (9)
        <Caret expanded={false} />
      </button>
      <div>
        {/* Two lines: the label with its caret, then the summary under it. */}
        <button
          type="button"
          className={textActionClassName('flex-wrap gap-x-1 text-left')}
          aria-expanded={open}
          aria-controls={settingsId}
          onClick={() => setOpen((o) => !o)}
        >
          <span>Search settings</span>
          <Caret expanded={open} />
          <span className="text-text-dim basis-full text-xs normal-case tracking-normal">
            {settingsLine(on, place, budget)}
          </span>
        </button>
        <Collapse open={open} id={settingsId} className="pt-2">
          <div className="space-y-3">
            <SegmentedControl
              label="Improve Reach"
              fill
              value="upgrade"
              onChange={() => {}}
              options={[
                { value: 'upgrade', label: 'Upgrade' },
                { value: 'rebalance', label: 'Rebalance' },
                { value: 'rework', label: 'Rework' },
              ]}
            />
            <SegmentedControl
              label="Improve mode"
              fill
              value="buy"
              onChange={() => {}}
              options={[
                { value: 'buy', label: 'Planning to buy' },
                { value: 'refit', label: 'Refitting a ship I own' },
              ]}
            />
            {placement === 'settings' && owned}
            <label className="block space-y-1 text-sm">
              <span>{on ? 'Budget for what you still buy (ISK)' : 'Total budget (ISK)'}</span>
              <IskInput value={budget} onChange={setBudget} />
            </label>
          </div>
        </Collapse>
      </div>
      {placement === 'top' && owned}
      <p className="text-sm">
        <span className="text-text-dim">Now → best found </span>
        <StatChange change={{ key: 'totalDps', before: 615.8, after: 647.5 }} />
        {', '}
        <StatChange change={{ key: 'ehp', before: 55_480, after: 58_877 }} />
      </p>
      <SegmentedControl
        label="Sort by"
        fill
        value={sort}
        onChange={setSort}
        options={[
          { value: 'gain', label: 'Biggest gain' },
          { value: 'value', label: 'Best value' },
          { value: 'cheapest', label: 'Cheapest' },
        ]}
      />
      <section className="space-y-2">
        <Eyebrow>No downside</Eyebrow>
        {list(NO_DOWNSIDE)}
      </section>
      <section className="space-y-2">
        <Eyebrow>Trade-offs</Eyebrow>
        {list(TRADE_OFFS)}
      </section>
      <div className="bg-panel border-line sticky bottom-0 -mx-4 space-y-2 border-t px-4 py-2">
        <p className="text-sm">
          {chosen.length} {chosen.length === 1 ? 'change' : 'changes'} ·{' '}
          {on ? 'still to buy' : 'costs'} <IskAmount value={stillToBuy} />
          <span className="text-text-dim"> of a 500M budget</span>
          {' · '}
          <StatChange change={{ key: 'totalDps', before: 615.8, after: 678.4 }} />
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-text-dim text-xs">Checked 47 swaps in 0.7 s</p>
          <Button variant="primary" size="sm" disabled={chosen.length === 0}>
            {chosen.length === 0 ? 'Apply' : `Apply ${chosen.length} changes`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The drawer's frame: a left panel at `md`, a bottom sheet below it. */
export function DrawerFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-stretch md:items-start md:p-4">
      <div className="bg-panel border-line flex h-screen w-full flex-col overflow-hidden border md:h-[calc(100vh-2rem)] md:w-[28rem] md:rounded-xs">
        <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Improve</h2>
            <p className="text-text-dim truncate text-xs">{SHIP}</p>
          </div>
          <IconButton icon={<Icon.Close />} label="Close" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-3">{children}</div>
      </div>
    </div>
  );
}
