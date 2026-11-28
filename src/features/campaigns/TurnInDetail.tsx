import {
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { OutcomeNote, type Outcome } from '@/components/OutcomeNote';
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
import {
  figureOpenerClassName,
  focusRingClassName,
  gripHitAreaClassName,
} from '@/components/ui/controlStyles';
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

const stop = (event: SyntheticEvent) => event.stopPropagation();
const stopRowEvents = {
  onClick: stop,
  onContextMenu: stop,
  onPointerDown: stop,
  onPointerUp: stop,
  onKeyDown: stop,
};

export interface TurnInDestinationViewProps {
  systemName: string;
  block: DestinationBlock;
  permissionLabel: string;
  sending: boolean;
  outcome: Outcome | null;
  onSend: () => void;
  mark?: ReactNode;
}

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
      <OutcomeNote outcome={outcome} as="p" />
    </div>
  );
}

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

export function TurnInParticipateLine({
  line,
  characterName,
  mark,
}: {
  line: ParticipateLine;
  characterName: string;
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
    <p className="text-xs text-text-dim">
      {t('campaigns.turnIn.paysOnlyIf')}
      {line.mark && <span className="ml-1 inline-flex align-middle">{mark}</span>}
    </p>
  );
}

export interface TurnInDetailViewProps {
  name: string;
  offer: TurnInOfferDetail;
  participate: ParticipateLine;
  characterName: string;
  participateMark?: ReactNode;
  destination?: ReactNode;
  surfaceLine?: ReactNode;
}

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
          <span className="text-base leading-tight font-semibold tabular-nums">
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
  characterId?: number | null;
  characterName?: string;
  surfaceLine?: ReactNode;
}

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

type TriggerProps = Omit<ComponentProps<'button'>, 'children'> & {
  name: string;
};

function stopThen(onClick: TriggerProps['onClick']) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick?.(event);
  };
}

export function TurnInGlyph({ name, className, onClick, ...props }: TriggerProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t('campaigns.turnIn.openDetail', { name })}
      {...props}
      onClick={stopThen(onClick)}
      className={cx(
        gripHitAreaClassName,
        '-my-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-xs align-middle text-text-dim hover:text-accent',
        focusRingClassName,
        className
      )}
    >
      <Icon.Faction size={Icon.ICON_SIZE.sm} aria-hidden="true" />
    </button>
  );
}

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
      className={cx(figureOpenerClassName, gripHitAreaClassName, 'tabular-nums', className)}
    >
      <span className="sr-only">{t('campaigns.turnIn.openDetail', { name })} </span>
      {children}
    </button>
  );
}
