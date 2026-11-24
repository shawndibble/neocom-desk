/**
 * `TurnInBreakdown` (issue #6705): the modal for a pile of items worth turning
 * in (the Appraisal's Turn in total). Items are grouped by **Item Trader**
 * (each empire's War HQ), each group with its subtotal, Set destination to the
 * trader's system and Copy list (EVE multibuy text, as the Appraisal's copy
 * lists), and each item with the Participate state of its objective.
 *
 * Without Military Campaigns (or a Character) there is no Participate column:
 * one caveat line above the groups says it pays only after Participate, with
 * the `GrantCellMark` by it while the Permission is missing.
 *
 * Never a predicted close date, a token count or "multiples of N" advice.
 * `TurnInBreakdownView` is the modal with every read made, for stories.
 */
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

/** One item of the pile; `note` is a line from the surface under its figure ("+1.4M over Sell now"). */
export interface TurnInBreakdownItem extends TurnInPileItem<TurnInOfferDetail> {
  note?: ReactNode;
}

type Line = TurnInPileLine<TurnInOfferDetail> & { note?: ReactNode };
type Group = TurnInTraderGroup<TurnInOfferDetail> & { lines: Line[] };

/** A group's system name: every line shares the trader's system. */
function systemNameOf(group: Group): string | null {
  return group.lines[0]?.offer.systemName ?? null;
}

function CopyListButton({ group }: { group: Group }) {
  const { t } = useTranslation();
  const { copied, flash } = useCopyFeedback<'copied' | 'failed'>(2000);
  // Bumped on every copy, so a second "Copied" is read out again.
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
  /** Per item (the Participate column), or one caveat line for the pile. */
  participate: PileParticipate;
  /** Each objective's answer, for the column. */
  stateOf: (objectiveId: string) => ParticipateState | undefined;
  characterName: string;
  /** The Military Campaigns `GrantCellMark`, by the caveat. */
  participateMark?: ReactNode;
  /** Set destination for one group (`TurnInDestination`). */
  destinationFor: (group: Group) => ReactNode;
  /** One line from the surface under the intro ("Items worth more handed in than sold now."). */
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
  // The pile-wide "press Participate" line only when it is true of every row: over a mixed
  // pile it read as if the Participating rows were not (each row's cell says its own state).
  const noneParticipating =
    perItem &&
    pile.groups.length > 0 &&
    pile.groups.every((g) =>
      g.lines.every((l) => stateOf(l.offer.objectiveId) === 'notParticipating')
    );

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
  /** Whose Participate, cap and waypoints: the active Character when omitted, `null` for none. */
  characterId?: number | null;
  characterName?: string;
  surfaceLine?: ReactNode;
}

/** The pile's turn-in modal, wired up. */
export function TurnInBreakdown({
  characterId,
  characterName,
  items,
  ...rest
}: TurnInBreakdownProps) {
  const character = useTurnInCharacter(characterId);
  const participate = useTurnInParticipate(character, characterName);
  const { participation } = participate;
  // The Character's own contribution counts against its per-Character cap.
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
