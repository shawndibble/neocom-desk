import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Disclosure, Modal, Spinner, StatChange } from '@/components/ui';
import type { FitOption } from '@/engine/fittings/makeItFit';
import {
  changeVerdict,
  diffFittingStats,
  type StatChange as StatChangeValue,
} from '@/engine/fittings/variationDelta';
import { changeLabel } from './fittingVariationsCsv';
import type { FittingCatalogue } from './useFittingCatalogue';
import { catalogueTypeName } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';
import { useMakeItFit } from './useMakeItFit';
import type { FitResource } from './makeItFitContext';
import { MakeItFitImplants, type MakeItFitImplantsInput } from './MakeItFitImplants';
import { MakeItFitSection } from './MakeItFitSection';
import { MakeItFitTraining } from './MakeItFitTraining';
import { freedLabel } from './makeItFitFreed';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { MakeItFitFixCard } from './MakeItFitFixCard';
import { MakeItFitProblem } from './MakeItFitProblem';

const OPTION_LIMIT = 8;

type Translate = Parameters<typeof changeLabel>[1];

const optionKey = (option: FitOption) =>
  option.swaps.map((s) => `${s.slot}${s.slotIndex}${s.toTypeId}`).join();

const BUDGET_KEYS = new Set(['cpuUsed', 'powergridUsed', 'calibrationUsed']);
const NAMED_OTHERS = 2;

interface Chip {
  key: string;
  text: string;
  verdict: 'better' | 'worse' | 'neutral';
}

function tradeOffChips(all: StatChangeValue[], t: Translate): Chip[] {
  const changes = all.filter((change) => !BUDGET_KEYS.has(change.key));
  const ehp = changes.find((change) => change.key === 'ehp');
  const resists = changes.filter((change) => change.key.endsWith('Resonance'));
  const others = changes.filter((change) => change !== ehp && !resists.includes(change));
  const deltas = resists.map((change) => change.after - change.before);
  const mixed = deltas.some((d) => d > 0) && deltas.some((d) => d < 0);
  const net = mixed ? 0 : deltas.reduce((a, b) => a + b, 0);
  const chips: Chip[] = [];
  if (ehp) chips.push({ key: 'ehp', text: changeLabel(ehp, t), verdict: changeVerdict(ehp) });
  if (resists.length > 0)
    chips.push({
      key: 'resists',
      text: t(
        net < 0
          ? 'fittings.makeItFit.resistsLower'
          : net > 0
            ? 'fittings.makeItFit.resistsHigher'
            : 'fittings.makeItFit.resistsChanged'
      ),
      verdict: mixed || net === 0 ? 'neutral' : net > 0 ? 'worse' : 'better',
    });
  for (const change of others.slice(0, NAMED_OTHERS))
    chips.push({ key: change.key, text: changeLabel(change, t), verdict: changeVerdict(change) });
  if (others.length > NAMED_OTHERS)
    chips.push({
      key: 'more',
      text: t('fittings.makeItFit.moreStats', { count: others.length - NAMED_OTHERS }),
      verdict: 'neutral',
    });
  return chips;
}

const CHIP_TONE = {
  better: 'text-success',
  worse: 'text-danger',
  neutral: 'text-text-dim',
} as const;

interface Props {
  open: boolean;
  resource: FitResource | null;
  onClose: () => void;
  variants: VariantEvaluator | null;
  skillGains: SkillGainEvaluator | null;
  characterId: number | null;
  fittingName: string;
  implants: MakeItFitImplantsInput | null;
  onImplantsApplied: (names: string) => void;
  catalogue: FittingCatalogue | null;
  onApply: (option: FitOption) => void;
  onOpenList?: () => void;
  placement: 'center' | 'sheet';
}

export function MakeItFitDialog({
  open,
  resource,
  onClose,
  variants,
  skillGains,
  characterId,
  fittingName,
  implants,
  onImplantsApplied,
  catalogue,
  onApply,
  onOpenList,
  placement,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const { result, before, failed } = useMakeItFit(variants, catalogue, open);
  const name = (typeId: number) => catalogueTypeName(catalogue, typeId);
  const shown = result?.options.slice(0, OPTION_LIMIT) ?? [];
  const fits = result !== null && result.options.length === 0 && !result.nothingFits;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={resource ? t(`fittings.makeItFit.fix.${resource}`) : t('fittings.makeItFit.title')}
      placement={placement === 'center' ? 'wide' : placement}
    >
      {fits ? (
        <p className="text-text-dim text-sm">{t('fittings.makeItFit.fits')}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[5fr_6fr]">
          <div className="space-y-5">
            {before && <MakeItFitProblem before={before} />}
            <MakeItFitTraining
              open={open}
              evaluator={skillGains}
              characterId={characterId}
              fittingName={fittingName}
            />
            {implants && (
              <MakeItFitImplants
                open={open}
                resource={resource}
                before={before}
                implants={implants}
                onApplied={onImplantsApplied}
              />
            )}
          </div>
          <MakeItFitSection
            heading={t('fittings.makeItFit.section.swap')}
            hint={t('fittings.makeItFit.sectionHint.swap')}
          >
            {failed ? (
              <p className="text-danger text-sm">{t('fittings.makeItFit.failed')}</p>
            ) : result === null || before === null ? (
              <p className="text-text-dim flex items-center gap-2 text-sm">
                <Spinner /> {t('fittings.makeItFit.searching')}
              </p>
            ) : result.options.length === 0 ? (
              <div className="space-y-2">
                <p className="text-text-dim text-sm">{t('fittings.makeItFit.nothingFits')}</p>
                {result.nothingFits && onOpenList && (
                  <Button size="sm" onClick={onOpenList}>
                    {t('fittings.makeItFit.openList')}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {result.options.length > OPTION_LIMIT && (
                  <p className="text-text-dim text-xs">
                    {t('fittings.makeItFit.showing', {
                      shown: OPTION_LIMIT,
                      total: result.options.length,
                    })}
                  </p>
                )}
                {shown.some((option) => option.iskDelta === null) && (
                  <p className="text-text-dim text-xs">{t('fittings.makeItFit.noPrice')}</p>
                )}
                <ul className="m-0 mt-3 list-none space-y-2.5 p-0">
                  {shown.map((option, index) => {
                    const delta = diffFittingStats(before, option.after);
                    const key = optionKey(option);
                    const chips = tradeOffChips(delta.changes, t);
                    return (
                      <MakeItFitFixCard
                        key={key}
                        tone="warning"
                        tag={index === 0 ? t('fittings.makeItFit.tagRecommended') : undefined}
                        items={option.swaps.map((swap) => ({
                          key: `${swap.slot}${swap.slotIndex}`,
                          typeId: swap.toTypeId,
                          name: name(swap.toTypeId),
                          detail: `${t('fittings.makeItFit.replaces', { from: name(swap.fromTypeId) })} · ${t(
                            `fittings.makeItFit.slot.${swap.slot}`,
                            { index: swap.slotIndex + 1 }
                          )}`,
                        }))}
                        freed={freedLabel(before, option.after, resource, t)}
                        budget={resource ? { resource, before, after: option.after } : null}
                        cost={option.iskDelta}
                        chips={
                          chips.length === 0 ? (
                            <span className="text-text-dim">
                              {t('fittings.makeItFit.noOtherChanges')}
                            </span>
                          ) : (
                            chips.map((chip) => (
                              <span
                                key={chip.key}
                                className={`bg-panel-2 rounded-xs px-1.5 py-0.5 ${CHIP_TONE[chip.verdict]}`}
                              >
                                {chip.text}
                              </span>
                            ))
                          )
                        }
                        onApply={() => onApply(option)}
                        footer={
                          delta.changes.length > 0 && (
                            <Disclosure
                              label={t('fittings.makeItFit.details')}
                              expanded={expanded.has(key)}
                              onToggle={() =>
                                setExpanded((current) => {
                                  const next = new Set(current);
                                  if (!next.delete(key)) next.add(key);
                                  return next;
                                })
                              }
                            >
                              <p className="text-text-dim flex flex-wrap gap-x-2 px-2 pb-2 text-xs">
                                {delta.changes.map((change) => (
                                  <StatChange key={change.key} change={change} />
                                ))}
                              </p>
                            </Disclosure>
                          )
                        }
                      />
                    );
                  })}
                </ul>
              </div>
            )}
          </MakeItFitSection>
        </div>
      )}
    </Modal>
  );
}
