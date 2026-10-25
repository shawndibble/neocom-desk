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
  StatChange,
} from '@/components/ui';
import { Collapse } from '@/components/ui/Collapse';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { textActionClassName } from '@/components/ui/textActionClassName';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { NewComponent } from './NewComponent';
import {
  GOALS,
  GROUP_ORDER,
  NO_DOWNSIDE,
  NOW_BEST,
  SHIP,
  TRADE_OFFS,
  type MockGoal,
  type MockRow,
} from './improveResultsFirstFixtures';

export type SettingsMode = 'collapse' | 'disclosure';
export type GoalsMode = 'relevant' | 'all';
export type HeaderMode = 'top' | 'summary';

const COMBAT = GOALS.filter((g) => g.group === 'Combat');
const OTHER = GOALS.filter((g) => g.group !== 'Combat');

const dimAction = (extra = '') => textActionClassName(cx('text-text-dim', extra));

/** One goal as a row: the chip, then what it scores, or why it is off. Readable on touch. */
function GoalRow({
  goal,
  selected,
  onPick,
}: {
  goal: MockGoal;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <li className="flex flex-col items-start gap-1 py-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="sm:w-52 sm:shrink-0">
        <FilterChip
          label={goal.label}
          selected={selected}
          disabled={Boolean(goal.reason)}
          onToggle={onPick}
        />
      </span>
      <span className={cx('text-xs', goal.reason ? 'text-warning' : 'text-text-dim')}>
        {goal.reason ?? goal.scores}
      </span>
    </li>
  );
}

function GoalPicker({
  mode,
  goal,
  setGoal,
  initialOpen,
}: {
  mode: GoalsMode;
  goal: string;
  setGoal: (id: string) => void;
  initialOpen: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const id = useId();
  const picked = GOALS.find((g) => g.id === goal) ?? GOALS[0]!;
  const pick = (next: string) => {
    setGoal(next);
    if (mode === 'all') setOpen(false);
  };

  if (mode === 'all') {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm">
            <span className="font-medium">{picked.label}</span>
            <span className="text-text-dim"> · {picked.scores}</span>
          </p>
          <button
            type="button"
            className={dimAction('shrink-0 gap-1')}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide goals' : 'Change goal'}
            <Caret expanded={open} />
          </button>
        </div>
        <Collapse open={open} id={id}>
          <NewComponent name="GroupedGoalList">
            <div className="space-y-3">
              {GROUP_ORDER.map((group) => (
                <div key={group}>
                  <Eyebrow>{group}</Eyebrow>
                  <ul>
                    {GOALS.filter((g) => g.group === group).map((g) => (
                      <GoalRow
                        key={g.id}
                        goal={g}
                        selected={g.id === goal}
                        onPick={() => pick(g.id)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </NewComponent>
        </Collapse>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Improve Goal" className="flex flex-wrap gap-2">
        {COMBAT.map((g) => (
          <FilterChip
            key={g.id}
            label={g.label}
            selected={g.id === goal}
            onToggle={() => pick(g.id)}
          />
        ))}
      </div>
      <p className="text-text-dim text-xs">{picked.scores}</p>
      <button
        type="button"
        className={textActionClassName('gap-1')}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        More goals ({OTHER.length})
        <Caret expanded={open} />
      </button>
      <Collapse open={open} id={id}>
        <NewComponent name="MoreGoalsList">
          <ul>
            {OTHER.map((g) => (
              <GoalRow key={g.id} goal={g} selected={g.id === goal} onPick={() => pick(g.id)} />
            ))}
          </ul>
        </NewComponent>
      </Collapse>
    </div>
  );
}

type Reach = 'upgrade' | 'rebalance' | 'rework';
type Mode = 'buy' | 'refit';

const REACH_HINT: Record<Reach, string> = {
  upgrade: 'Turns a fitted module into a variation of itself.',
  rebalance: 'Also tries a different module doing the same job.',
  rework: 'Tries any module that can move this goal.',
};

interface SettingsState {
  reach: Reach;
  setReach: (r: Reach) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  budget: string;
  setBudget: (b: string) => void;
}

function useSettings(): SettingsState {
  const [reach, setReach] = useState<Reach>('upgrade');
  const [mode, setMode] = useState<Mode>('buy');
  const [budget, setBudget] = useState('');
  return { reach, setReach, mode, setMode, budget, setBudget };
}

const settingsLine = (s: SettingsState) =>
  [
    s.reach[0]!.toUpperCase() + s.reach.slice(1),
    s.mode === 'buy' ? 'Planning' : 'Refitting',
    s.budget ? `${s.mode === 'buy' ? 'budget' : 'cap'} ${s.budget}` : 'no budget',
  ].join(' · ');

function SettingsFields({ s }: { s: SettingsState }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Improve Reach"
        fill
        value={s.reach}
        onChange={s.setReach}
        options={[
          { value: 'upgrade', label: 'Upgrade' },
          { value: 'rebalance', label: 'Rebalance' },
          { value: 'rework', label: 'Rework' },
        ]}
      />
      <p className="text-text-dim text-xs">{REACH_HINT[s.reach]}</p>
      <SegmentedControl
        label="Improve mode"
        fill
        value={s.mode}
        onChange={s.setMode}
        options={[
          { value: 'buy', label: 'Planning to buy' },
          { value: 'refit', label: 'Refitting a ship I own' },
        ]}
      />
      <label className="block space-y-1 text-sm">
        <span>{s.mode === 'buy' ? 'Total budget (ISK)' : 'Extra spend cap (ISK)'}</span>
        <IskInput value={s.budget} onChange={s.setBudget} />
      </label>
      <div>
        <button
          type="button"
          className={textActionClassName('gap-1')}
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => setMoreOpen((o) => !o)}
        >
          Rigs and officer modules
          <Caret expanded={moreOpen} />
        </button>
        <Collapse open={moreOpen} id={moreId} className="pt-2">
          <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
            <Checkbox /> Rigs
          </label>
          <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
            <Checkbox /> Officer and Deadspace modules
          </label>
        </Collapse>
      </div>
    </div>
  );
}

function ResultRow({ row, ticked, onTick }: { row: MockRow; ticked: boolean; onTick: () => void }) {
  return (
    <li className="border-line rounded-xs border">
      <label className={cx('flex items-start gap-3 px-3 py-2', tappableRowClassName)}>
        <Checkbox checked={ticked} onChange={onTick} className="mt-0.5" />
        <span className="min-w-0 flex-1 space-y-0.5 text-sm">
          <span className="block font-medium">{row.swap}</span>
          <span className="block text-xs">
            {row.changes.map((c) => (
              <StatChange key={c.key} change={c} />
            ))}
          </span>
          {row.givesUp && (
            <span className="text-text-dim block text-xs">
              Gives up: <StatChange change={row.givesUp} />
            </span>
          )}
          <span className="block text-xs">
            Costs <IskAmount value={row.isk} />
          </span>
        </span>
      </label>
    </li>
  );
}

function NowBest() {
  return (
    <NewComponent name="NowBestHeader">
      <p className="text-sm">
        <span className="text-text-dim">Now → best found </span>
        <span className="font-medium">
          DPS {NOW_BEST.dps.now} → up to <span className="text-success">{NOW_BEST.dps.best}</span>
        </span>
        <span className="text-text-dim"> · </span>
        <span className="font-medium">
          EHP {NOW_BEST.ehp.now} → up to <span className="text-success">{NOW_BEST.ehp.best}</span>
        </span>
      </p>
    </NewComponent>
  );
}

function Results({ header }: { header: HeaderMode }) {
  const [sort, setSort] = useState('gain');
  const [ticks, setTicks] = useState<ReadonlySet<string>>(new Set(['a']));
  const flip = (id: string) =>
    setTicks((t) => {
      const next = new Set(t);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const all = [...NO_DOWNSIDE, ...TRADE_OFFS];
  const chosen = all.filter((r) => ticks.has(r.id));
  const cost = chosen.reduce((sum, r) => sum + r.isk, 0);
  const list = (rows: readonly MockRow[]) => (
    <ul className="space-y-2">
      {rows.map((r) => (
        <ResultRow key={r.id} row={r} ticked={ticks.has(r.id)} onTick={() => flip(r.id)} />
      ))}
    </ul>
  );
  return (
    <div className="space-y-3">
      {header === 'top' && <NowBest />}
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
      <div className="bg-surface border-line sticky bottom-0 -mx-4 space-y-2 border-t px-4 py-2">
        <p className="text-sm">
          {chosen.length === 0 ? (
            header === 'summary' ? (
              <>
                Best found: DPS {NOW_BEST.dps.now} → up to {NOW_BEST.dps.best}
              </>
            ) : (
              <span className="text-text-dim">Tick changes to apply together.</span>
            )
          ) : (
            <>
              {chosen.length} {chosen.length === 1 ? 'change' : 'changes'} · Costs{' '}
              <IskAmount value={cost} />
              {header === 'summary' ? (
                <>
                  {' · '}DPS {NOW_BEST.dps.now} → 104.9{' '}
                  <span className="text-text-dim">of up to {NOW_BEST.dps.best}</span>
                </>
              ) : (
                <> · DPS {NOW_BEST.dps.now} → 104.9</>
              )}
            </>
          )}
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-text-dim text-xs">Checked 110 swaps in 4.2 s</p>
          <Button variant="primary" size="sm" disabled={chosen.length === 0}>
            {chosen.length === 0 ? 'Apply' : `Apply ${chosen.length}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The drawer body after a finished search. Q1 `settings`, Q2 `goals`, Q3 `header`
 * pick the variant; everything not varied is today's drawer.
 */
export function ImproveBody({
  settings,
  goals,
  header,
  goalsOpen,
}: {
  settings: SettingsMode;
  goals: GoalsMode;
  header: HeaderMode;
  goalsOpen: boolean;
}) {
  const [goal, setGoal] = useState('overall');
  const s = useSettings();
  const [editOpen, setEditOpen] = useState(false);
  const [moreSettings, setMoreSettings] = useState(false);
  const editId = useId();
  const picker = <GoalPicker mode={goals} goal={goal} setGoal={setGoal} initialOpen={goalsOpen} />;
  const picked = GOALS.find((g) => g.id === goal) ?? GOALS[0]!;
  return (
    <div className="space-y-4">
      {settings === 'collapse' ? (
        <div className="space-y-3">
          <NewComponent name="SettingsSummaryStrip">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm">
                {picked.label} · {settingsLine(s)}
              </p>
              <button
                type="button"
                className={dimAction('shrink-0 gap-1')}
                aria-expanded={editOpen}
                aria-controls={editId}
                onClick={() => setEditOpen((o) => !o)}
              >
                {editOpen ? 'Hide' : 'Edit'}
                <Caret expanded={editOpen} />
              </button>
            </div>
          </NewComponent>
          <Collapse open={editOpen} id={editId}>
            <div className="space-y-4 pb-1">
              {picker}
              <SettingsFields s={s} />
            </div>
          </Collapse>
        </div>
      ) : (
        <div className="space-y-3">
          {picker}
          <NewComponent name="SearchSettingsDisclosure">
            <button
              type="button"
              className={textActionClassName('w-full justify-between gap-2')}
              aria-expanded={moreSettings}
              aria-controls={editId}
              onClick={() => setMoreSettings((o) => !o)}
            >
              <span>Search settings</span>
              <span className="text-text-dim flex items-center gap-1 normal-case tracking-normal">
                {settingsLine(s)}
                <Caret expanded={moreSettings} />
              </span>
            </button>
            <Collapse open={moreSettings} id={editId} className="pt-2">
              <SettingsFields s={s} />
            </Collapse>
          </NewComponent>
        </div>
      )}
      <Results header={header} />
    </div>
  );
}

/** The drawer's frame: a left panel at `md`, a bottom sheet below it. */
export function DrawerFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-stretch md:items-start md:p-4">
      <div className="bg-surface border-line flex h-screen w-full flex-col overflow-hidden border md:h-[calc(100vh-2rem)] md:w-[28rem] md:rounded-xs">
        <div className="border-line flex items-center justify-between gap-2 border-b px-4 py-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Improve</h2>
            <p className="text-text-dim truncate text-xs">{SHIP}</p>
          </div>
          <IconButton icon={<Icon.Close />} label="Close" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}
