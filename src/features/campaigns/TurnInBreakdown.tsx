import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataTable, LiveStatus, Modal, type DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { ParticipateState } from '@/engine/campaigns/participation';
import {
  groupTurnInPile,
  type TurnInPileItem,
  type TurnInPileLine,
  type TurnInTraderGroup,
} from '@/engine/market/turnInPile';
import { writeToClipboard } from '@/lib/clipboard';
import { createNumberFormat } from '@/lib/numberLocale';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { TurnInDestination, TurnInParticipateLine } from './TurnInDetail';
import {
  approxIsk,
  filledPercent,
  rewardSplitText,
  traderPlace,
  turnInGroupMultibuy,
  type PileParticipate,
} from './turnInContent';
import { useTurnInCharacter, useTurnInParticipate } from './useTurnInParticipate';
import type { TurnInOfferDetail } from './useTurnIns';

const countFormat = createNumberFormat({ maximumFractionDigits: 0 });

export interface TurnInBreakdownItem extends TurnInPileItem<TurnInOfferDetail> {
  note?: ReactNode;
}

type Line = TurnInPileLine<TurnInOfferDetail> & { note?: ReactNode };
type Group = TurnInTraderGroup<TurnInOfferDetail> & { lines: Line[] };

function systemNameOf(group: Group): string | null {
  return group.lines[0]?.offer.systemName ?? null;
}

function CopyListButton({ group }: { group: Group }) {
  const { t } = useTranslation();
  const { copied, flash } = useCopyFeedback<'copied' | 'failed'>(2000);
  const [copies, setCopies] = useState(0);
  const result =
    copied === 'copied'
      ? t('campaigns.turnIn.breakdown.copied')
      : copied === 'failed'
        ? t('campaigns.turnIn.breakdown.copyFailed')
        : null;
  return (
    <>
      <Button
        size="sm"
        aria-label={t('campaigns.turnIn.breakdown.copyListFor', { trader: group.traderName })}
        onClick={() => {
          writeToClipboard(turnInGroupMultibuy(group)).then(
            () => flash('copied'),
            () => flash('failed')
          );
          setCopies((n) => n + 1);
        }}
      >
        <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        {result ?? t('campaigns.turnIn.breakdown.copyList')}
      </Button>
      <LiveStatus announceKey={copies}>{result}</LiveStatus>
    </>
  );
}

function ParticipateCell({ state }: { state: ParticipateState | undefined }) {
  const { t } = useTranslation();
  if (state === 'participating') {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
        {t('campaigns.turnIn.breakdown.participating')}
      </span>
    );
  }
  if (state === 'notParticipating') {
    return <span className="text-warning">{t('campaigns.turnIn.breakdown.notParticipating')}</span>;
  }
  return <span className="text-text-dim">—</span>;
}

export interface TurnInBreakdownViewProps {
  open: boolean;
  onClose: () => void;
  items: readonly TurnInBreakdownItem[];
  participate: PileParticipate;
  stateOf: (objectiveId: string) => ParticipateState | undefined;
  characterName: string;
  participateMark?: ReactNode;
  destinationFor: (group: Group) => ReactNode;
  surfaceLine?: ReactNode;
}

export function TurnInBreakdownView({
  open,
  onClose,
  items,
  participate,
  stateOf,
  characterName,
  participateMark,
  destinationFor,
  surfaceLine,
}: TurnInBreakdownViewProps) {
  const { t } = useTranslation();
  const pile = useMemo(() => groupTurnInPile(items), [items]);
  const perItem = participate.kind === 'perItem';
  const columns = useMemo<DataTableColumn<Line>[]>(
    () => [
      {
        id: 'item',
        header: t('campaigns.turnIn.breakdown.item'),
        primary: true,
        render: (line) => line.name,
      },
      {
        id: 'quantity',
        header: t('campaigns.turnIn.breakdown.quantity'),
        align: 'right',
        render: (line) => (
          <span className="tabular-nums">
            {countFormat(line.reward.quantity)}
            {line.reward.quantity < line.quantity && (
              <span className="ml-1 text-text-dim">
                {t('campaigns.turnIn.breakdown.ofAsked', { asked: countFormat(line.quantity) })}
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'each',
        header: t('campaigns.turnIn.breakdown.each'),
        align: 'right',
        render: (line) => (
          <span className="flex flex-col items-end tabular-nums max-sm:items-start">
            <span>{approxIsk(line.offer.totalPerItem)}</span>
            <span className="text-[0.6875rem] text-text-dim">{rewardSplitText(line.offer, t)}</span>
          </span>
        ),
      },
      {
        id: 'turnedIn',
        header: t('campaigns.turnIn.breakdown.turnedIn'),
        align: 'right',
        render: (line) => (
          <span className="flex flex-col items-end tabular-nums max-sm:items-start">
            <span className="font-semibold">{approxIsk(line.reward.total)}</span>
            {line.note && <span className="text-[0.6875rem]">{line.note}</span>}
          </span>
        ),
      },
      {
        id: 'filled',
        header: t('campaigns.turnIn.breakdown.filled'),
        align: 'right',
        render: (line) => <span className="tabular-nums">{filledPercent(line.offer)}%</span>,
      },
      ...(perItem
        ? [
            {
              id: 'participate',
              header: t('campaigns.turnIn.breakdown.participate'),
              render: (line: Line) => <ParticipateCell state={stateOf(line.offer.objectiveId)} />,
            },
          ]
        : []),
    ],
    [t, perItem, stateOf]
  );
  const states = pile.groups.flatMap((g) => g.lines.map((l) => stateOf(l.offer.objectiveId)));
  const noneParticipating =
    perItem && states.includes('notParticipating') && !states.includes('participating');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('campaigns.turnIn.breakdown.title', { total: approxIsk(pile.total) })}
      placement="wide"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1 text-xs text-text-dim">
          <p>{t('campaigns.turnIn.breakdown.intro')}</p>
          {surfaceLine && <p>{surfaceLine}</p>}
          {participate.kind === 'paysOnlyIf' && (
            <TurnInParticipateLine
              line={participate}
              characterName={characterName}
              mark={participateMark}
            />
          )}
          {noneParticipating && (
            <TurnInParticipateLine
              line={{ kind: 'notParticipating' }}
              characterName={characterName}
            />
          )}
        </div>
        {pile.groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon.Faction size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                {traderPlace(group.traderName, systemNameOf(group))}
                <span className="ml-1.5 tabular-nums">{approxIsk(group.subtotal)}</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {destinationFor(group)}
                <CopyListButton group={group} />
              </div>
            </div>
            <DataTable
              columns={columns}
              rows={group.lines}
              rowKey={(line) => line.offer.typeId}
              label={t('campaigns.turnIn.breakdown.tableLabel', { trader: group.traderName })}
              stickyHeader={false}
            />
          </section>
        ))}
      </div>
    </Modal>
  );
}

export interface TurnInBreakdownProps {
  open: boolean;
  onClose: () => void;
  items: readonly TurnInBreakdownItem[];
  characterId?: number | null;
  characterName?: string;
  surfaceLine?: ReactNode;
}

export function TurnInBreakdown({
  characterId,
  characterName,
  items,
  ...rest
}: TurnInBreakdownProps) {
  const character = useTurnInCharacter(characterId);
  const participate = useTurnInParticipate(character, characterName);
  const { participation } = participate;
  const counted = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        contributed:
          item.contributed ?? participation?.contributedTo(item.offer.objectiveId) ?? undefined,
      })),
    [items, participation]
  );
  const stateOf = useMemo(
    () => (objectiveId: string) => participation?.stateOf(objectiveId),
    [participation]
  );
  return (
    <TurnInBreakdownView
      {...rest}
      items={counted}
      participate={participate.pile}
      stateOf={stateOf}
      characterName={participate.name}
      participateMark={participate.mark}
      destinationFor={(group) =>
        group.systemId !== null &&
        systemNameOf(group) !== null && (
          <TurnInDestination
            systemId={group.systemId}
            systemName={systemNameOf(group) ?? ''}
            characterId={character}
            characterName={participate.name}
          />
        )
      }
    />
  );
}
