import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { Button, Caret, Eyebrow, FilterChip, IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { NewComponent } from './NewComponent';

/**
 * The bell popover, today vs proposed (docs/design/alerts-panel-ux-research.md).
 *
 * The real `AlertsPanel` reads the live feed out of Dexie, so these stories
 * draw the rows from fixed sample groups inside a popover-sized surface
 * instead of mounting the page. Everything else is a real primitive.
 *
 * New components in this mockup: `AlertGroupRow` (the proposed row — topic
 * glyph, eyebrow, whole-row click target and the trailing ⋮).
 */
const meta = {
  title: 'mockups/AlertsPanel',
  tags: ['!manifest'],
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type Topic = 'structures' | 'market' | 'industry' | 'skills' | 'mail';

interface SampleGroup {
  key: string;
  topic: Topic;
  label: string;
  body: string;
  age: string;
  count: number;
  severity: 'critical' | 'warning' | 'watch' | 'clear';
  snoozable?: boolean;
}

const TOPIC_GLYPH: Record<Topic, typeof Icon.NavAlerts> = {
  structures: Icon.NavCorp,
  market: Icon.NavMarket,
  industry: Icon.NavIndustry,
  skills: Icon.NavSkills,
  mail: Icon.NavMail,
};

const TOPIC_WORD: Record<Topic, string> = {
  structures: 'Structures',
  market: 'Market',
  industry: 'Industry',
  skills: 'Skills',
  mail: 'Mail',
};

const GROUPS: SampleGroup[] = [
  {
    key: 'eveType:StructureUnderAttack',
    topic: 'structures',
    label: 'Structure under attack',
    body: 'Astrahus "Ridgeline" is under attack in J155207',
    age: '4m',
    count: 3,
    severity: 'critical',
  },
  {
    key: 'event:structureFuelLow',
    topic: 'structures',
    label: 'Structure fuel low',
    body: 'Raitaru "Efa Works" has 2d 4h of fuel left',
    age: '21m',
    count: 2,
    severity: 'warning',
  },
  {
    key: 'event:marketOrderUndercut',
    topic: 'market',
    label: 'Market order undercut',
    body: 'Your sell order for Tritanium was undercut in Amarr',
    age: '38m',
    count: 12,
    severity: 'warning',
  },
  {
    key: 'event:priceAlertTriggered',
    topic: 'market',
    label: 'Price alert triggered',
    body: 'PLEX passed 5.40M ISK in Jita',
    age: '1h',
    count: 1,
    severity: 'clear',
    snoozable: true,
  },
  {
    key: 'event:industryJobComplete',
    topic: 'industry',
    label: 'Industry job complete',
    body: 'Manufacturing of 10 × Hobgoblin II finished in Efa VI',
    age: '2h',
    count: 7,
    severity: 'watch',
  },
  {
    key: 'event:skillLevelComplete',
    topic: 'skills',
    label: 'Skill level complete',
    body: 'Caldari Battleship V finished training',
    age: '5h',
    count: 1,
    severity: 'watch',
  },
  {
    key: 'event:newMail',
    topic: 'mail',
    label: 'New mail',
    body: 'Corp broadcast from Alliance HQ',
    age: '9h',
    count: 4,
    severity: 'watch',
  },
];

/** The popover surface the panel is drawn into: the real width from `AlertsBell`. */
function PanelSurface({ children, phone }: { children: ReactNode; phone?: boolean }) {
  return (
    <div
      className={cx(
        'overflow-hidden rounded-xs border border-line bg-panel text-sm',
        phone ? 'w-[22rem]' : 'w-[26rem]'
      )}
    >
      {children}
    </div>
  );
}

function PanelHeader() {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line bg-panel px-3.5 py-2">
      <h2 className="text-sm font-semibold">30 alerts waiting</h2>
      <span className="flex items-center gap-3">
        <span className="text-xs text-accent">Mark all read</span>
        <span className="text-xs text-accent">Close</span>
      </span>
    </div>
  );
}

function ChipBar({ size }: { size: 'sm' | 'md' }) {
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-line px-3.5 py-2">
      {['All', 'Danger', 'Market', 'Industry', 'Mail', 'Structures', 'Skills'].map((id) => (
        <FilterChip key={id} label={id} selected={id === 'All'} onToggle={() => {}} size={size} />
      ))}
    </div>
  );
}

function PanelFooter() {
  return (
    <div className="px-3.5 pt-2.5 pb-3">
      <span className="text-xs text-accent">Notify me about…</span>
      <p className="pt-1 text-xs text-text-dim">Push notifications are on</p>
    </div>
  );
}

/* ----------------------------- Today ----------------------------- */

/** The row as `AlertsPanel.tsx` draws it now: label, body, then a wrapping row of Buttons. */
function TodayRow({ group, size }: { group: SampleGroup; size: 'sm' | 'md' }) {
  const danger = group.severity === 'critical';
  const many = group.count > 1;
  return (
    <li
      className={cx(
        'grid gap-1 border-b border-line px-3.5 py-2.5',
        danger && 'border-l-2 border-l-danger bg-danger/5'
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 font-semibold">
          {group.label}
          {many && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-text-dim">
              <Caret expanded={false} />
              {group.count} alerts
            </span>
          )}
        </span>
        <time className="shrink-0 text-[0.6875rem] tabular-nums text-text-dim">{group.age}</time>
      </div>
      <p className="text-xs text-text-dim">{group.body}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Button size={size} variant={danger ? 'primary' : 'ghost'}>
          View
        </Button>
        {group.snoozable && <Button size={size}>Snooze 1h</Button>}
        <Button size={size}>
          {many
            ? danger
              ? `Acknowledge all ${group.count}`
              : `Dismiss all ${group.count}`
            : danger
              ? 'Acknowledge'
              : 'Dismiss'}
        </Button>
      </div>
    </li>
  );
}

/* ---------------------------- Proposed ---------------------------- */

/**
 * The proposed row. The whole row is the click target: a single-fire group
 * goes to its View destination, a group of many expands, and the caret and
 * count are the expand-state cue rather than a second control.
 *
 * Severity keeps today's critical-only treatment — `severityTone.ts` warns
 * against a third telling of a fact the worst-first sort already carries, and
 * a `warning` tint would be colour with no word behind it (§7).
 *
 * Dismiss is the × at the head of the trailing cluster, visible at rest on
 * every input: nothing else on the row clears it, so it cannot hide. Tapping
 * it slides the row toward the inline start (left, in English) and `Collapse`
 * takes its height — the same direction as the phone swipe. The ⋮ may dim,
 * because a right-click with a pointer and a touch-and-hold on touch (§6c)
 * both open the same menu; it is drawn at its rest opacity here, and in the
 * build goes full on `group-hover` / `focus-within` and is always full on
 * touch.
 *
 * A critical row has neither: Acknowledge is already visible and worded, and
 * once it is, the menu has only one item left — below §6c's two-action
 * minimum. Its settings live in the footer's "Notify me about…" link.
 */
function AlertGroupRow({ group, size }: { group: SampleGroup; size: 'sm' | 'md' }) {
  const Glyph = TOPIC_GLYPH[group.topic];
  const danger = group.severity === 'critical';
  const many = group.count > 1;
  return (
    <li
      className={cx(
        'group flex items-start gap-2.5 border-b border-line px-3.5 py-2.5',
        danger && 'border-l-2 border-l-danger bg-danger/5'
      )}
    >
      <Glyph
        aria-hidden="true"
        className={cx('mt-0.5 size-4 shrink-0', danger ? 'text-danger' : 'text-text-dim')}
      />
      <div className="min-w-0 flex-1">
        <Eyebrow as="p" className="text-text-dim">
          {TOPIC_WORD[group.topic]} · {group.age}
        </Eyebrow>
        <p className="flex items-baseline gap-2 font-semibold">
          <span className="min-w-0 truncate">{group.label}</span>
          {many && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-normal text-text-dim">
              <Caret expanded={false} />
              {group.count}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-text-dim">{group.body}</p>
        {danger && (
          <Button size={size} variant="primary" className="mt-1.5">
            Acknowledge
          </Button>
        )}
      </div>
      {!danger && (
        <span className="flex shrink-0 items-center gap-0.5">
          <IconButton
            icon={<Icon.Close />}
            label={
              many ? `Dismiss all ${group.count} ${group.label} alerts` : `Dismiss ${group.label}`
            }
            variant="plain"
            size={size === 'md' ? 'md' : 'row'}
          />
          <IconButton
            icon={<Icon.More />}
            label={`More actions for ${group.label}`}
            variant="plain"
            size={size === 'md' ? 'md' : 'row'}
            className="opacity-45"
          />
        </span>
      )}
    </li>
  );
}

/**
 * The ⋮ menu, drawn open beside the panel so the screenshot shows its items.
 * Dismiss is not in it — that is the row's own ×, and §6c's "Duplicates" rule
 * means it cannot be in both places.
 */
function MenuPreview() {
  return (
    <div className="w-60 rounded-xs border border-line bg-panel py-1 text-sm shadow-lg">
      {['Snooze 1h', 'Stop these alerts', 'Notification settings…'].map((item) => (
        <p key={item} className="px-3 py-1.5 hover:bg-bg-raised">
          {item}
        </p>
      ))}
    </div>
  );
}

/** The Undo toast a Dismiss raises, since there is no undismiss path (research §4a). */
function UndoToast() {
  return (
    <div className="flex w-[26rem] items-center justify-between gap-3 rounded-xs border border-line bg-panel px-3.5 py-2 text-sm shadow-lg">
      <span>Market order undercut dismissed · 12 alerts</span>
      <span className="text-accent">Undo</span>
    </div>
  );
}

/* ----------------------------- Stories ----------------------------- */

/** @summary Today: every group row carries two or three full-size Buttons, and nothing tells the types apart. */
export const Today: Story = {
  render: () => (
    <PanelSurface>
      <PanelHeader />
      <ChipBar size="sm" />
      <ul>
        {GROUPS.map((group) => (
          <TodayRow key={group.key} group={group} size="sm" />
        ))}
      </ul>
      <PanelFooter />
    </PanelSurface>
  ),
};

/** @summary Proposed: the row is the target (view, or expand a group), topic glyph plus eyebrow separates the types, a visible × dismisses in one tap and the ⋮ holds Snooze / Stop these alerts / Settings. New component: AlertGroupRow. */
export const Proposed: Story = {
  render: () => (
    <div className="flex items-start gap-6">
      <NewComponent name="AlertGroupRow">
        <PanelSurface>
          <PanelHeader />
          <ChipBar size="sm" />
          <ul>
            {GROUPS.map((group) => (
              <AlertGroupRow key={group.key} group={group} size="sm" />
            ))}
          </ul>
          <PanelFooter />
        </PanelSurface>
      </NewComponent>
      <div className="grid gap-6 pt-24">
        <MenuPreview />
        <UndoToast />
      </div>
    </div>
  ),
};

/** @summary Proposed, phone sheet: the same rows at touch sizing, where the ⋮ is always at full opacity and the × doubles as the non-gesture path for swipe-to-dismiss. */
export const ProposedPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => (
    <NewComponent name="AlertGroupRow">
      <PanelSurface phone>
        <PanelHeader />
        <ChipBar size="md" />
        <ul>
          {GROUPS.slice(0, 5).map((group) => (
            <AlertGroupRow key={group.key} group={group} size="md" />
          ))}
        </ul>
        <PanelFooter />
      </PanelSurface>
    </NewComponent>
  ),
};
