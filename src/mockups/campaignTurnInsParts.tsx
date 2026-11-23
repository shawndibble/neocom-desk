/**
 * Shared pieces of the Campaign turn-ins mockups:
 *
 * - `TurnInDetail`: the one single-item popover every surface opens. Each
 *   surface only supplies its trigger (`TurnInFigure`, `TurnInGlyph`, or its
 *   own button).
 * - `PermissionCellMark`: the amber mark that opens a grant popover for one
 *   Character and one Permission (a new reusable primitive).
 * - `MarketFrame`: the Market page header and tabs the Market stories sit in.
 *
 * When a new component repeats on screen, only the first one (`labelled`)
 * carries the dashed "New component" label and the rest get a dashed outline,
 * so the label never pushes a dense row apart.
 */
import { useId, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ProgressBar,
  Tabs,
  Tooltip,
} from '@/components/ui';
import {
  figureOpenerClassName,
  focusRingClassName,
  inlineLinkClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { NewComponent } from './NewComponent';
import {
  NOT_SIGNED_UP,
  PAYS_ONLY_IF_SHORT,
  WAYPOINT_PERMISSION,
  WHY_MILITARY_CAMPAIGNS,
  WHY_WAYPOINTS,
  approxK,
  rewardEach,
  rewardSplit,
  type TurnInItem,
  type TurnInState,
  type WriteState,
} from './campaignTurnInsFixtures';

/** Dashed outline for a repeat of a new component already labelled once on screen. */
const REPEAT_OUTLINE = 'rounded-xs outline-dashed outline-1 outline-offset-1 outline-warning';

export function MaybeNew({
  name,
  labelled,
  children,
  inline = false,
}: {
  name: string;
  labelled: boolean;
  children: ReactNode;
  inline?: boolean;
}) {
  if (labelled)
    return (
      <NewComponent name={name}>
        {/* Drops an inline mark below its label, which wraps to two lines in a narrow box. */}
        {inline ? <span className="inline-block pt-4">{children}</span> : children}
      </NewComponent>
    );
  return inline ? (
    <span className={REPEAT_OUTLINE}>{children}</span>
  ) : (
    <div className={REPEAT_OUTLINE}>{children}</div>
  );
}

/**
 * New primitive. A small amber `Icon.Warn` beside something that leans on a
 * Permission a Character lacks. A press opens a popover that grants it for
 * THAT Character, stops asking (account-wide), or goes to Settings ›
 * Permissions. Never a full `GrantBanner`.
 */
export function PermissionCellMark({
  character,
  permission = 'Military Campaigns',
  why,
  defaultOpen = false,
}: {
  character: string;
  permission?: string;
  why: string;
  defaultOpen?: boolean;
}) {
  const titleId = useId();
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${character}: ${permission} not granted`}
          className={cx(
            'relative z-10 inline-flex shrink-0 cursor-pointer items-center align-[-0.125em] text-warning hover:text-warning/80',
            focusRingClassName
          )}
        >
          <Icon.Warn className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        // Clear of the phone shell's bottom tabs.
        collisionPadding={{ top: 8, right: 8, bottom: 80, left: 8 }}
        aria-labelledby={titleId}
        className="w-72 max-w-[calc(100vw-2rem)] p-3 text-sm"
      >
        <p id={titleId} className="font-semibold text-warning">
          {character}: grant {permission}
        </p>
        <p className="mt-1 text-xs text-text-dim">{why}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm">
            Grant in EVE
          </Button>
          <Button size="sm">Don&apos;t ask again</Button>
        </div>
        <Link
          to="/settings/permissions"
          className={cx(inlineLinkClassName, 'mt-3 inline-block text-xs')}
        >
          Grant missing Permissions
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** Where the Character stands with Participate, and the mark when the Permission is missing. */
function ParticipateLine({
  state,
  character,
  markLabelled,
  openMark,
}: {
  state: TurnInState;
  character: string;
  markLabelled: boolean;
  openMark: boolean;
}) {
  if (state === 'participating')
    return (
      <p className="flex items-center gap-1 text-xs text-success">
        <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
        {character} pressed Participate
      </p>
    );
  if (state === 'notSignedUp') return <p className="text-xs text-warning">{NOT_SIGNED_UP}</p>;
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-text-dim">
      {PAYS_ONLY_IF_SHORT}
      {state === 'missing' && (
        <MaybeNew name="PermissionCellMark" labelled={markLabelled} inline>
          <PermissionCellMark
            character={character}
            why={WHY_MILITARY_CAMPAIGNS(character)}
            defaultOpen={openMark}
          />
        </MaybeNew>
      )}
    </div>
  );
}

/**
 * Set destination to the Item Trader's system. Without the waypoint Permission
 * it stays visible but aria-disabled, with the mark right after it (no reason
 * text in the layout). Dismissed: no mark; the tooltip names the Permission.
 */
function SetDestination({
  item,
  character,
  write,
  markLabelled,
  openMark,
}: {
  item: TurnInItem;
  character: string;
  write: WriteState;
  markLabelled: boolean;
  openMark: boolean;
}) {
  const blocked = write !== 'granted';
  const reason =
    write === 'dismissed'
      ? `Needs the ${WAYPOINT_PERMISSION} Permission`
      : write === 'noCharacter'
        ? 'Log in a Character to set a destination'
        : null;
  const button = (
    <Button
      size="sm"
      aria-disabled={blocked || undefined}
      aria-label={`Set destination to ${item.system}`}
    >
      <Icon.Faction size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      Set destination
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {reason ? <Tooltip content={reason}>{button}</Tooltip> : button}
      {write === 'missing' && (
        <MaybeNew name="PermissionCellMark" labelled={markLabelled} inline>
          <PermissionCellMark
            character={character}
            permission={WAYPOINT_PERMISSION}
            why={WHY_WAYPOINTS(character)}
            defaultOpen={openMark}
          />
        </MaybeNew>
      )}
    </div>
  );
}

export interface TurnInDetailProps {
  item: TurnInItem;
  /** The Character the Participate line and the grants are for. */
  character: string;
  state: TurnInState;
  write?: WriteState;
  /** One extra fact from the surface: "You hold 340 · ~19.1M turned in", a buy order's margin. */
  extra?: ReactNode;
  /** Which mark carries the dashed label / opens (a mockup aid). */
  markLabelled?: boolean;
  openMark?: 'participate' | 'write';
}

/** New component. The popover's body: one item's Turn-in Reward and how to collect it. */
export function TurnInDetailBody({
  item,
  character,
  state,
  write = 'granted',
  extra,
  markLabelled = false,
  openMark,
}: TurnInDetailProps) {
  return (
    <div className="flex w-80 max-w-full flex-col gap-2 p-3 text-sm">
      <p className="font-semibold">{item.name}</p>
      <div>
        <p className="flex items-baseline gap-1.5">
          <span className="text-lg leading-tight font-semibold tabular-nums">
            {approxK(rewardEach(item))}
          </span>
          <span className="text-xs text-text-dim">each turned in</span>
        </p>
        <p className="text-xs text-text-dim tabular-nums">{rewardSplit(item)}</p>
      </div>
      {extra && <p className="text-xs">{extra}</p>}
      <p className="flex items-center gap-1 text-xs">
        <Icon.Faction size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-text-dim" />
        {item.trader} · {item.system}
      </p>
      <div className="flex items-center gap-2 text-xs">
        <ProgressBar
          label="Campaign Objective filled"
          value={item.filledPct}
          size="xs"
          className="min-w-0 flex-1"
        />
        <span className="shrink-0 tabular-nums">{item.filledPct}% filled</span>
      </div>
      <ParticipateLine
        state={state}
        character={character}
        markLabelled={markLabelled}
        openMark={openMark === 'participate'}
      />
      <p className="text-[0.6875rem] text-text-dim">
        LP paid per full 100 items · + faction tokens
      </p>
      <SetDestination
        item={item}
        character={character}
        write={write}
        markLabelled={markLabelled}
        openMark={openMark === 'write'}
      />
    </div>
  );
}

/** The popover around a surface's own trigger. */
export function TurnInDetail({
  trigger,
  defaultOpen = false,
  labelled = true,
  ...body
}: TurnInDetailProps & {
  trigger: ReactElement;
  defaultOpen?: boolean;
  labelled?: boolean;
}) {
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={{ top: 8, right: 8, bottom: 80, left: 8 }}
        aria-label={`${body.item.name}: turn-in reward`}
        className="max-w-[calc(100vw-1rem)] p-0"
      >
        <MaybeNew name="TurnInDetail" labelled={labelled}>
          <TurnInDetailBody {...body} />
        </MaybeNew>
      </PopoverContent>
    </Popover>
  );
}

/** Trigger: the figure itself, dashed underlined, like the Refine figure. */
export function TurnInFigure({
  children,
  label,
  ...props
}: { children: ReactNode; label: string } & Record<string, unknown>) {
  return (
    <button
      type="button"
      {...props}
      onClick={(event: MouseEvent) => {
        // The press never reaches the row beneath (as `RefineFigureButton`).
        event.stopPropagation();
        (props.onClick as ((e: MouseEvent) => void) | undefined)?.(event);
      }}
      className={cx(figureOpenerClassName, 'relative tabular-nums')}
    >
      <span className="sr-only">{label} </span>
      {children}
    </button>
  );
}

/** Trigger: a small dim glyph after a figure (§6c's glyph-after-a-figure cue). */
export function TurnInGlyph({ label, ...props }: { label: string } & Record<string, unknown>) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className={cx(
        'relative z-10 ml-1 inline-flex cursor-pointer items-center align-[-0.125em] text-text-dim hover:text-accent',
        focusRingClassName
      )}
    >
      <Icon.Faction size={Icon.ICON_SIZE.sm} aria-hidden="true" />
    </button>
  );
}

const MARKET_TABS = [
  { id: 'browser', label: 'Market' },
  { id: 'orders', label: 'Open' },
  { id: 'stock', label: 'Stock' },
  { id: 'history', label: 'History' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'appraisal', label: 'Appraisal' },
  { id: 'hauling', label: 'Hauling' },
];

/** Market's header and section tabs, as the real page draws them. */
export function MarketFrame({ tab, children }: { tab: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-page flex-col gap-4 px-4 py-4">
      <PageHeader title="Market" />
      <Tabs
        label="Market sections"
        tabsId="mockup-market"
        value={tab}
        onChange={() => {}}
        tabs={MARKET_TABS}
      />
      {children}
    </div>
  );
}
