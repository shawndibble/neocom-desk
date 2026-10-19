import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Caret,
  Disclosure,
  IskAmount,
  Panel,
  TypeIcon,
  textActionClassName,
} from '@/components/ui';
import { VerbTag } from '../DirectiveRow';
import { PlanetImage } from '../PlanetImage';
import { Gain } from '../PlanSlotNudge';
import { Sentence } from '../sentence';
import type { AlternativeView, ChecklistColumn, PlanView, RebuildCardView } from '../planView';
import { RebuildSteps } from './RebuildSteps';
import { ItemLink, ItemList, type Ticks } from './shared';

function haulClause(t: ReturnType<typeof useTranslation>['t'], haulDays: number): string {
  if (haulDays === 1) return t('piPlan.make.haulDaily');
  if (haulDays === 7) return t('piPlan.make.haulWeekly');
  return t('piPlan.make.haulEvery', { count: haulDays });
}

function RebuildSentence({
  card,
  haulDays,
  upgradeFrom,
}: {
  card: RebuildCardView;
  haulDays: number;
  upgradeFrom: number | null;
}) {
  const { t } = useTranslation();
  const planet = <b className="font-semibold">{card.name}</b>;
  const type = <span className="text-text-dim">({t(`pi.planetType.${card.planetType}`)})</span>;
  if (card.status === 'change' && card.target && card.gainPerDay !== null) {
    return (
      <>
        <Sentence
          text={t('piPlan.make.rebuild.change', {
            planet: '{planet}',
            type: '{type}',
            item: '{item}',
            gain: '{gain}',
            context: card.hasQuickWin ? 'ontop' : undefined,
            minutes: card.minutes ?? 0,
            haul: haulClause(t, haulDays),
          })}
          slots={{
            planet,
            type,
            item: <ItemLink item={card.target} />,
            gain: <Gain value={card.gainPerDay} />,
          }}
        />
        {upgradeFrom !== null && <> {t('piPlan.make.rebuild.upgradeFirst')}</>}
      </>
    );
  }
  if (card.status === 'keep') {
    const reason = card.keepReason ?? 'already-best';
    // Never "keep on" raw ore: the recommendation ends at P1 or above.
    if (card.sellsRaw) {
      return (
        <Sentence
          text={t(
            card.hasRefineWin ? 'piPlan.make.rebuild.rawQuickWin' : 'piPlan.make.rebuild.raw',
            {
              planet: '{planet}',
              type: '{type}',
              items: '{items}',
            }
          )}
          slots={{ planet, type, items: <ItemList items={card.sells} /> }}
        />
      );
    }
    return (
      <Sentence
        text={t(
          card.sells.length > 0 ? 'piPlan.make.rebuild.keep' : 'piPlan.make.rebuild.keepAsIs',
          {
            planet: '{planet}',
            type: '{type}',
            items: '{items}',
            reason: t(`piPlan.make.rebuild.keepReason.${reason}`),
          }
        )}
        slots={{ planet, type, items: <ItemList items={card.sells} /> }}
      />
    );
  }
  return (
    <Sentence
      text={t(
        card.refusal === 'link-cost'
          ? 'piPlan.make.rebuild.needsLinkCost'
          : 'piPlan.make.rebuild.unknown',
        { planet: '{planet}', type: '{type}' }
      )}
      slots={{ planet, type }}
    />
  );
}

function AlternativeBody({ alt }: { alt: AlternativeView }) {
  const { t } = useTranslation();
  const delta = alt.iskPerDayDelta;
  const same = Math.round(Math.abs(delta)) === 0;
  const hauls =
    alt.haulRatio === null
      ? null
      : Math.abs(alt.haulRatio - 1) < 0.1
        ? t('piPlan.make.altHaulSame')
        : alt.haulRatio > 1
          ? t('piPlan.make.altHaulLess', { x: formatTimes(alt.haulRatio) })
          : t('piPlan.make.altHaulMore', { x: formatTimes(1 / alt.haulRatio) });
  return (
    <div className="flex items-start gap-2 text-[0.6875rem] text-text-dim">
      <TypeIcon typeId={alt.typeId} size={32} width={20} height={20} />
      <span>
        <Sentence
          text={t(alt.tier === 2 ? 'piPlan.make.altP2' : 'piPlan.make.altP1', {
            item: '{item}',
            delta: '{delta}',
            hauls: hauls ?? '',
            context: hauls === null ? 'nohaul' : undefined,
          })}
          slots={{
            item: <ItemLink item={alt} />,
            delta: same ? (
              t('piPlan.make.altSame')
            ) : (
              <>
                <b className={delta >= 0 ? 'text-isk-pos' : 'text-isk-neg'}>
                  <IskAmount value={Math.abs(delta)} decimals={0} />
                  {t('piPlan.make.perDay')}
                </b>{' '}
                {delta >= 0 ? t('piPlan.make.altMore') : t('piPlan.make.altLess')}
              </>
            ),
          }}
        />
      </span>
    </div>
  );
}

function formatTimes(ratio: number): string {
  return ratio >= 10 ? String(Math.round(ratio)) : (Math.round(ratio * 10) / 10).toString();
}

/** A caret text action that opens a block in place, below its row. */
function InlineToggle({
  expanded,
  controls,
  onToggle,
  children,
}: {
  expanded: boolean;
  controls: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      className={textActionClassName('gap-1 whitespace-nowrap')}
    >
      <Caret expanded={expanded} />
      {children}
    </button>
  );
}

function RebuildCard({
  card,
  haulDays,
  steps,
  ticks,
}: {
  card: RebuildCardView;
  haulDays: number;
  /** The in-game steps for a change; null for a colony that keeps its setup. */
  steps: ChecklistColumn | null;
  ticks: Ticks;
}) {
  const isChange = card.status === 'change';
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const altId = useId();
  const stepsId = useId();
  const nowItem = card.sells[0];
  const doneCount = steps ? steps.steps.filter((step) => ticks.has(step.id)).length : 0;
  // Opens once a step is ticked (ticks may load late) and stays open: unticking the last
  // one must not fold the list under the pilot. The pilot's own toggle wins.
  const [stepsChoice, setStepsChoice] = useState<boolean | null>(null);
  const [autoOpened, setAutoOpened] = useState(doneCount > 0);
  if (doneCount > 0 && !autoOpened) setAutoOpened(true);
  const stepsOpen = stepsChoice ?? autoOpened;
  return (
    <li id={card.anchor} tabIndex={-1} className="scroll-mt-4 px-3 py-3 outline-none">
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <PlanetImage type={card.planetType} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text">
            <RebuildSentence
              card={card}
              haulDays={haulDays}
              upgradeFrom={steps?.fit?.upgradeFromLevel ?? null}
            />
          </p>
          {(steps || card.alternative) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {steps && (
                <InlineToggle
                  expanded={stepsOpen}
                  controls={stepsId}
                  onToggle={() => setStepsChoice(!stepsOpen)}
                >
                  {t('piPlan.make.steps.toggle')}{' '}
                  <span className="sr-only">
                    {t('piPlan.make.steps.forName', { name: steps.name })}
                  </span>{' '}
                  <span className="font-normal tracking-normal text-text-dim normal-case">
                    {'· '}
                    {t('piPlan.make.steps.count', { count: steps.steps.length })}
                    {' · '}
                    {t('piPlan.make.minutes', { count: steps.minutes })}
                    {doneCount > 0 && (
                      <span className="text-success">
                        {' · '}
                        {t('piPlan.make.steps.done', {
                          done: doneCount,
                          count: steps.steps.length,
                        })}
                      </span>
                    )}
                  </span>
                </InlineToggle>
              )}
              {steps && card.alternative && (
                <span aria-hidden="true" className="text-text-dim">
                  ·
                </span>
              )}
              {card.alternative && (
                <InlineToggle expanded={open} controls={altId} onToggle={() => setOpen(!open)}>
                  {t('piPlan.make.alternative', { count: 1 })}
                </InlineToggle>
              )}
            </div>
          )}
          {card.alternative && open && (
            <div id={altId} className="mt-1.5">
              <AlternativeBody alt={card.alternative} />
            </div>
          )}
          {steps && stepsOpen && <RebuildSteps id={stepsId} column={steps} ticks={ticks} />}
        </div>
        {(card.status !== 'unknown' || card.toPerDay !== null) && (
          <div className="flex shrink-0 items-center gap-3 max-sm:order-last max-sm:basis-full max-sm:pl-14">
            <span className="flex items-center gap-1.5 text-xs text-text-dim tabular-nums">
              {isChange && card.fromPerDay !== null && (
                <>
                  {nowItem && <TypeIcon typeId={nowItem.typeId} size={32} width={20} height={20} />}
                  <IskAmount value={card.fromPerDay} decimals={0} />
                  <span aria-label={t('piPlan.make.to')}>→</span>
                  {card.target && (
                    <TypeIcon typeId={card.target.typeId} size={32} width={20} height={20} />
                  )}
                </>
              )}
              {!isChange && nowItem && (
                <TypeIcon typeId={nowItem.typeId} size={32} width={20} height={20} />
              )}
              {card.toPerDay !== null && (
                <span className="text-sm font-semibold text-text">
                  <IskAmount value={card.toPerDay} decimals={0} />
                  <span className="ml-1 text-[0.6875rem] font-normal text-text-dim">
                    {t('piPlan.make.perDay')}
                  </span>
                </span>
              )}
            </span>
            {/* A kept colony sits under its own fold: an As-is tag would repeat it. */}
            {isChange && <VerbTag verb="rebuild" label={t('piPlan.make.tagRebuild')} />}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * The rebuilds. Changes stay in view; kept or unmeasured colonies fold under one
 * disclosure, so nothing-to-change is one line, not a card per planet.
 */
export function RebuildPanel({
  view,
  ticks,
  reveal,
}: {
  view: PlanView;
  ticks: Ticks;
  /** The card a `#plan-<anchor>` link points at, and that navigation's key. */
  reveal: { anchor: string | null; navKey: string };
}) {
  const { t } = useTranslation();
  const stepsFor = new Map(view.checklist.map((column) => [column.planetId, column]));
  const changed = view.rebuilds.filter((card) => card.status === 'change');
  const kept = view.rebuilds.filter((card) => card.status !== 'change');
  // A link to a folded card opens the fold in the same render, so the card exists when
  // the page scrolls to it; following the link again reopens it. A toggle made since wins.
  const [choice, setChoice] = useState<{ open: boolean; navKey: string } | null>(null);
  const linkedIntoKept =
    reveal.anchor !== null && kept.some((card) => card.anchor === reveal.anchor);
  const open =
    choice?.navKey === reveal.navKey ? choice.open : linkedIntoKept || (choice?.open ?? false);
  const renderCard = (c: RebuildCardView) => (
    <RebuildCard
      key={c.planetId}
      card={c}
      haulDays={view.hauling.haulDays}
      steps={stepsFor.get(c.planetId) ?? null}
      ticks={ticks}
    />
  );
  return (
    <Panel
      title={t(
        view.quickWins.length > 0 ? 'piPlan.make.rebuildTitleThen' : 'piPlan.make.rebuildTitle'
      )}
      wrapMeta
      meta={
        <span className="text-[0.6875rem] text-text-dim tabular-nums max-md:basis-full">
          {t('piPlan.make.rebuildCount', {
            changed: view.headline.rebuildCount,
            total: view.headline.colonyCount,
          })}
        </span>
      }
      padded={false}
    >
      {changed.length > 0 ? (
        <ul className="divide-y divide-line">{changed.map(renderCard)}</ul>
      ) : (
        <p className="px-3 py-2.5 text-sm text-text-dim">{t('piPlan.make.noRebuild')}</p>
      )}
      {kept.length > 0 && (
        <Disclosure
          className="border-t border-line"
          label={t('piPlan.make.keptGroup', { count: kept.length })}
          expanded={open}
          onToggle={() => setChoice({ open: !open, navKey: reveal.navKey })}
        >
          <ul className="divide-y divide-line">{kept.map(renderCard)}</ul>
        </Disclosure>
      )}
    </Panel>
  );
}
