import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, InfoTooltip, IskAmount, Panel, TypeIcon } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { PlanetImage } from '../PlanetImage';
import { Gain } from '../PlanSlotNudge';
import { Sentence } from '../sentence';
import type { PlanView, QuickWinAction, QuickWinRow } from '../planView';
import { ItemLink, Minutes, type Ticks } from './shared';

const ACTION_BADGE: Record<QuickWinAction, ReactNode> = {
  restart: <Icon.Refresh size={10} />,
  storage: <Icon.Container size={10} />,
  idle: <Icon.PiFactory size={10} />,
  extractors: <Icon.PiExtractor size={10} />,
  factories: <Icon.PiFactory size={10} />,
};

function QuickWinSentence({ win, names }: { win: QuickWinRow; names: Map<number, string> }) {
  const { t } = useTranslation();
  const planet = <b className="font-semibold">{win.planetName}</b>;
  const item = win.iconTypeId !== null && win.subject !== null && (
    <ItemLink item={{ typeId: win.iconTypeId, name: win.subject }} />
  );
  const { detail } = win;
  switch (detail.kind) {
    case 'restart':
      return (
        <Sentence
          text={t(`piPlan.make.win.restart_${detail.reason}`, {
            count: detail.extractors,
            planet: '{planet}',
            item: '{item}',
          })}
          slots={{ planet, item }}
        />
      );
    case 'storage':
      return (
        <Sentence
          text={t('piPlan.make.win.storage', {
            hours: Math.max(1, Math.round(detail.hoursToFull)),
            count: Math.max(1, Math.round(detail.haulHours / 24)),
            planet: '{planet}',
          })}
          slots={{ planet }}
        />
      );
    case 'idle-factories':
      return (
        <Sentence
          text={t(
            detail.headsToAdd !== null && win.subject !== null
              ? 'piPlan.make.win.idleFeed'
              : 'piPlan.make.win.idle',
            {
              count: detail.pinCount,
              heads: detail.headsToAdd ?? 0,
              planet: '{planet}',
              item: '{item}',
            }
          )}
          slots={{ planet, item }}
        />
      );
    case 'spare-room':
      if (detail.what === 'extractors') {
        return (
          <Sentence
            text={t('piPlan.make.win.extractors', {
              count: detail.extraEcus,
              planet: '{planet}',
              item: '{item}',
            })}
            slots={{ planet, item }}
          />
        );
      }
      return (
        <>
          <Sentence
            text={t('piPlan.make.win.factories', {
              count: detail.factories,
              planet: '{planet}',
              item: '{item}',
            })}
            slots={{ planet, item }}
          />
          {detail.routedFrom.length > 0 && (
            <>
              {' '}
              {t('piPlan.make.win.factoriesFrom', {
                planets: detail.routedFrom
                  .map((id) => names.get(id) ?? t('pi.planetLabel', { id }))
                  .join(', '),
              })}
            </>
          )}
          {detail.needsRemoval && <> {t('piPlan.make.win.factoriesRemoveFirst')}</>}
        </>
      );
  }
}

export function QuickWinsPanel({
  view,
  ticks,
  pricesDown = false,
}: {
  view: PlanView;
  ticks: Ticks;
  /** Hub prices unreadable: the wins shown need none, so no gain is drawn, not even "No ISK figure". */
  pricesDown?: boolean;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const names = new Map(view.strips.map((strip) => [strip.planetId, strip.name]));
  const { headline } = view;
  return (
    <Panel
      title={t('piPlan.make.quickTitle')}
      meta={
        <span className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-text-dim tabular-nums">
          <span>
            {t('piPlan.make.minutesTotal', { count: headline.quickWinMinutes })}
            {!pricesDown && (
              <>
                {' · '}
                <Gain value={headline.quickWinPerDay} />
              </>
            )}
          </span>
          {pricesDown ? (
            <span>{t('piPlan.make.quickFootNoPrices')}</span>
          ) : (
            <InfoTooltip
              label={t('piPlan.make.quickFootLabel')}
              glyph="info"
              content={
                t('piPlan.make.quickFoot') +
                (view.quickWins.some((win) => win.gainKind === 'saves')
                  ? ` ${t('piPlan.make.quickFootSaves')}`
                  : '')
              }
            />
          )}
        </span>
      }
      padded={false}
    >
      <ul className="divide-y divide-line">
        {view.quickWins.map((win) => {
          const ticked = ticks.has(win.id);
          const sentenceId = `${baseId}-${win.id}`;
          return (
            <li key={win.id} className="flex items-center gap-3 px-3 py-2">
              <label className={cx(touchCheckboxLabelClassName, 'max-md:size-9')}>
                <Checkbox
                  checked={ticked}
                  onChange={() => ticks.toggle(win.id)}
                  aria-labelledby={sentenceId}
                />
              </label>
              <PlanetImage type={win.planetType} size={36} badge={ACTION_BADGE[win.action]} />
              {win.iconTypeId !== null && (
                <TypeIcon typeId={win.iconTypeId} size={32} width={24} height={24} />
              )}
              {/* Below md the gain sits under the sentence, so the sentence keeps the row's width. */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-3">
                <p
                  id={sentenceId}
                  className={cx(
                    'min-w-0 flex-1 text-xs text-text',
                    ticked && 'text-text-dim line-through'
                  )}
                >
                  <QuickWinSentence win={win} names={names} />
                </p>
                <span className="flex items-center gap-3 text-xs md:shrink-0">
                  {pricesDown ? null : win.gainPerDay === null ? (
                    <span className="text-text-dim">{t('piPlan.make.unpriced')}</span>
                  ) : win.gainKind === 'saves' ? (
                    <span className="tabular-nums text-warning">
                      {t('piPlan.make.saves')} <IskAmount value={win.gainPerDay} decimals={0} />
                      {t('piPlan.make.perDay')}
                    </span>
                  ) : (
                    <Gain value={win.gainPerDay} />
                  )}
                  <Minutes value={win.minutes} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
