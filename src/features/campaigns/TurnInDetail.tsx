/**
 * `TurnInDetail` (issue #6705): the one single-item popover every surface
 * opens on a campaign turn-in — the Appraisal's Turn in figure, the Market
 * item's "Turn in ~60K", Open Orders, Assets, Hauling and the Overview widget.
 * Callers supply only the trigger: their own figure (`TurnInFigureButton`) or
 * the dim glyph after one (`TurnInGlyph`).
 *
 * It holds the Turn-in Reward each and its ISK + LP split, the Item Trader and
 * system, how full the Campaign Objective is, the Character's Participate
 * line, the LP block and "+ faction tokens", an optional line from the
 * surface, and Set destination to the trader's system.
 *
 * `TurnInDetailBody` is the content alone, for a surface that already has a
 * detail view (Open Orders' `OrderDetailModal`); `TurnInDetailView` is that
 * content with every read already made, for stories.
 *
 * Never a predicted close date, a token count or "multiples of N" advice.
 */
import {
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { GrantCellMark } from '@/app/GrantCellMark';
import { usePermissionMark } from '@/app/usePermissionMark';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ProgressBar,
  Tooltip,
} from '@/components/ui';
import { figureOpenerClassName, focusRingClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { PERMISSIONS } from '@/esi/registry';
import { useSetDestination } from '@/features/travel/useSetDestination';
import { WAYPOINT_ENDPOINTS, WAYPOINT_GROUPS } from '@/features/travel/waypointOutcome';
import { cx } from '@/lib/cx';
import {
  approxIsk,
  destinationBlock,
  filledPercent,
  lpBlockText,
  rewardSplitText,
  traderPlace,
  type DestinationBlock,
  type ParticipateLine,
} from './turnInContent';
import { useTurnInCharacter, useTurnInParticipate } from './useTurnInParticipate';
import type { TurnInOfferDetail } from './useTurnIns';

/** A press inside the portalled popover never reaches a row beneath its trigger (§6c). */
const stop = (event: SyntheticEvent) => event.stopPropagation();
const stopRowEvents = {
  onClick: stop,
  onContextMenu: stop,
  onPointerDown: stop,
  onPointerUp: stop,
  onKeyDown: stop,
};

/* ------------------------------------------------------------------ */
/* Set destination                                                     */
/* ------------------------------------------------------------------ */

export interface TurnInDestinationViewProps {
  systemName: string;
  block: DestinationBlock;
  /** "Autopilot waypoints", named by a dismissed button's tooltip. */
  permissionLabel: string;
  sending: boolean;
  outcome: { tone: 'status' | 'alert'; text: ReactNode } | null;
  onSend: () => void;
  /** The waypoint `GrantCellMark`, drawn after the button when `block` is `mark`. */
  mark?: ReactNode;
}

/**
 * Set destination as drawn. Blocked, it stays visible and `aria-disabled`:
 * with the mark after it and no words when Autopilot waypoints is missing, or
 * a tooltip saying why (no Character, offline, the Permission dismissed).
 */
export function TurnInDestinationView({
  systemName,
  block,
  permissionLabel,
  sending,
  outcome,
  onSend,
  mark,
}: TurnInDestinationViewProps) {
  const { t } = useTranslation();
  const reason =
    block.kind !== 'reason' || block.reason === null
      ? null
      : block.reason === 'noCharacter'
        ? t('travel.waypoints.needCharacter')
        : block.reason === 'offline'
          ? t('common.needsConnection')
          : t('campaigns.turnIn.needsPermission', { permission: permissionLabel });
  const button = (
    <Button
      size="sm"
      // Stays focusable so its tooltip can say why (DESIGN §6c Disabled).
      aria-disabled={block.kind !== 'ready' || undefined}
      loading={sending}
      aria-label={t('campaigns.turnIn.setDestinationTo', { system: systemName })}
      onClick={onSend}
    >
      <Icon.Faction size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      {t('campaigns.turnIn.setDestination')}
    </Button>
  );
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {reason ? <Tooltip content={reason}>{button}</Tooltip> : button}
        {block.kind === 'mark' && mark}
      </div>
      {outcome && (
        <p
          role={outcome.tone}
          className={cx('text-xs', outcome.tone === 'alert' ? 'text-danger' : 'text-success')}
        >
          {outcome.text}
        </p>
      )}
    </div>
  );
}

/** Set destination to a trader's system for `characterId`'s client, wired up. */
export function TurnInDestination({
  systemId,
  systemName,
  characterId,
  characterName,
}: {
  systemId: number;
  systemName: string;
  characterId: number | null;
  characterName?: string;
}) {
  const { t } = useTranslation();
  const destination = useSetDestination(systemId, systemName, true, characterId);
  const permission = usePermissionMark(characterId, { endpoints: WAYPOINT_ENDPOINTS });
  const group = WAYPOINT_GROUPS[0];
  const name = characterName ?? permission?.storedName ?? t('reauth.unknownCharacter');
  return (
    <TurnInDestinationView
      systemName={systemName}
      block={destinationBlock({
        characterId,
        lacksScope: destination.missingGroups.length > 0,
        offline: destination.offline,
        permission: permission?.status,
      })}
      permissionLabel={group ? t(PERMISSIONS[group].labelKey) : ''}
      sending={destination.sending}
      outcome={destination.outcome}
      onSend={destination.send}
      mark={
        characterId !== null && (
          <GrantCellMark
            characterId={characterId}
            characterName={name}
            endpoints={WAYPOINT_ENDPOINTS}
            why={t('campaigns.turnIn.whyWaypoints', { name })}
          />
        )
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Participate                                                         */
/* ------------------------------------------------------------------ */

/** The Participate line: participating, not participating, or the caveat with an optional mark. */
export function TurnInParticipateLine({
  line,
  characterName,
  mark,
}: {
  line: ParticipateLine;
  characterName: string;
  /** The Military Campaigns `GrantCellMark`, by the caveat when `line.mark`. */
  mark?: ReactNode;
}) {
  const { t } = useTranslation();
  if (line.kind === 'participating') {
    return (
      <p className="flex items-center gap-1 text-xs text-success">
        <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
        {t('campaigns.turnIn.participating', { name: characterName })}
      </p>
    );
  }
  if (line.kind === 'notParticipating') {
    return <p className="text-xs text-warning">{t('campaigns.turnIn.notParticipating')}</p>;
  }
  return (
    // Plain inline text, so the mark follows the last word instead of wrapping onto a line of its own.
    <p className="text-xs text-text-dim">
      {t('campaigns.turnIn.paysOnlyIf')}
      {line.mark && <span className="ml-1 inline-flex align-middle">{mark}</span>}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* The detail                                                          */
/* ------------------------------------------------------------------ */

export interface TurnInDetailViewProps {
  /** The item turned in. */
  name: string;
  offer: TurnInOfferDetail;
  participate: ParticipateLine;
  characterName: string;
  participateMark?: ReactNode;
  /** Set destination (`TurnInDestination`); left out when the trader's system is unknown. */
  destination?: ReactNode;
  /** One line from the surface: "You hold 340 · ~19.1M turned in", a buy order's margin. */
  surfaceLine?: ReactNode;
}

/** The detail's content with every read already made. */
export function TurnInDetailView({
  name,
  offer,
  participate,
  characterName,
  participateMark,
  destination,
  surfaceLine,
}: TurnInDetailViewProps) {
  const { t } = useTranslation();
  const percent = filledPercent(offer);
  return (
    <div className="flex w-80 max-w-full flex-col gap-2 p-3 text-sm">
      <p className="font-semibold">{name}</p>
      <div>
        <p className="flex items-baseline gap-1.5">
          <span className="text-lg leading-tight font-semibold tabular-nums">
            {approxIsk(offer.totalPerItem)}
          </span>
          <span className="text-xs text-text-dim">{t('campaigns.turnIn.eachTurnedIn')}</span>
        </p>
        <p className="text-xs text-text-dim tabular-nums">{rewardSplitText(offer, t)}</p>
      </div>
      {surfaceLine && <p className="text-xs">{surfaceLine}</p>}
      <p className="flex items-center gap-1 text-xs">
        <Icon.Faction size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-text-dim" />
        {traderPlace(offer.traderName, offer.systemName)}
      </p>
      <div className="flex items-center gap-2 text-xs">
        <ProgressBar
          label={t('campaigns.turnIn.filledLabel')}
          value={percent}
          size="xs"
          className="min-w-0 flex-1"
        />
        <span className="shrink-0 tabular-nums">{t('campaigns.turnIn.filled', { percent })}</span>
      </div>
      <TurnInParticipateLine
        line={participate}
        characterName={characterName}
        mark={participateMark}
      />
      <p className="text-[0.6875rem] text-text-dim">{lpBlockText(offer, t)}</p>
      {destination}
    </div>
  );
}

export interface TurnInDetailBodyProps {
  name: string;
  offer: TurnInOfferDetail;
  /** Whose Participate and waypoints: the row's Character; the active one when omitted, `null` for none. */
  characterId?: number | null;
  characterName?: string;
  surfaceLine?: ReactNode;
}

/** The detail's content, wired up: for a popover (`TurnInDetail`) or an existing detail view. */
export function TurnInDetailBody({
  name,
  offer,
  characterId,
  characterName,
  surfaceLine,
}: TurnInDetailBodyProps) {
  const character = useTurnInCharacter(characterId);
  const participate = useTurnInParticipate(character, characterName);
  return (
    <TurnInDetailView
      name={name}
      offer={offer}
      participate={participate.lineFor(offer.objectiveId)}
      characterName={participate.name}
      participateMark={participate.mark}
      surfaceLine={surfaceLine}
      destination={
        offer.systemId !== null &&
        offer.systemName !== null && (
          <TurnInDestination
            systemId={offer.systemId}
            systemName={offer.systemName}
            characterId={character}
            characterName={participate.name}
          />
        )
      }
    />
  );
}

/** The popover shell around a caller's trigger, for the wired body or a story's view. */
export function TurnInPopover({
  name,
  trigger,
  defaultOpen = false,
  children,
}: {
  name: string;
  trigger: ReactElement;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        // Clear of the phone shell's bottom tabs.
        collisionPadding={{ top: 8, right: 8, bottom: 80, left: 8 }}
        aria-label={t('campaigns.turnIn.dialogLabel', { name })}
        className="max-w-[calc(100vw-1rem)] p-0"
        {...stopRowEvents}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** One item's turn-in popover, opened from the caller's own trigger. */
export function TurnInDetail({
  trigger,
  defaultOpen,
  ...body
}: TurnInDetailBodyProps & { trigger: ReactElement; defaultOpen?: boolean }) {
  return (
    <TurnInPopover name={body.name} trigger={trigger} defaultOpen={defaultOpen}>
      <TurnInDetailBody {...body} />
    </TurnInPopover>
  );
}

/* ------------------------------------------------------------------ */
/* Triggers                                                            */
/* ------------------------------------------------------------------ */

type TriggerProps = Omit<ComponentProps<'button'>, 'children'> & {
  /** The item, named in the accessible name ("Turn-in reward for …"). */
  name: string;
};

/** Runs the caller's click after stopping it at the trigger: the press never reaches the row. */
function stopThen(onClick: TriggerProps['onClick']) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick?.(event);
  };
}

/**
 * The trigger as a small dim glyph after a figure the surface already shows
 * (Assets' value, Hauling's Sell at, a buy order's price): §6c's
 * glyph-after-a-figure cue.
 */
export function TurnInGlyph({ name, className, onClick, ...props }: TriggerProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t('campaigns.turnIn.openDetail', { name })}
      {...props}
      onClick={stopThen(onClick)}
      className={cx(
        'ml-1 inline-flex shrink-0 cursor-pointer items-center rounded-xs align-[-0.125em] text-text-dim hover:text-accent',
        focusRingClassName,
        className
      )}
    >
      <Icon.Faction size={Icon.ICON_SIZE.sm} aria-hidden="true" />
    </button>
  );
}

/**
 * The trigger as the turn-in figure itself, dashed underlined (the Refine
 * figure's cue): the Appraisal's Turn in column, the Market item's "Turn in ~60K".
 */
export function TurnInFigureButton({
  name,
  className,
  onClick,
  children,
  ...props
}: TriggerProps & { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      {...props}
      onClick={stopThen(onClick)}
      className={cx(figureOpenerClassName, 'tabular-nums', className)}
    >
      <span className="sr-only">{t('campaigns.turnIn.openDetail', { name })} </span>
      {children}
    </button>
  );
}
