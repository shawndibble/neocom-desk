import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { Fragment, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import type { ItemMenuFor } from '@/features/market/ItemContextMenu';
import { jobsOfRuns, type BuildRecipe } from './subBuildPlan';

interface BuildRecipeModalProps {
  recipe: BuildRecipe | null;
  onClose: () => void;
  nameFor: (typeID: number) => string;
  onOpenRecipe: (typeID: number) => void;
  itemMenuFor?: ItemMenuFor;
  itemActionsFor?: (typeId: number) => ReactElement;
}

export function BuildRecipeModal({
  recipe,
  onClose,
  nameFor,
  onOpenRecipe,
  itemMenuFor,
  itemActionsFor,
}: BuildRecipeModalProps) {
  const { t } = useTranslation();
  const name = recipe ? nameFor(recipe.typeID) : '';
  const title = t('industry.buildRecipe.title', { material: name });
  const withMenu = (typeID: number, trigger: ReactElement) =>
    itemMenuFor ? itemMenuFor(typeID, trigger) : trigger;

  return (
    <Modal
      open={recipe !== null}
      onClose={onClose}
      title={recipe ? withMenu(recipe.typeID, <span>{title}</span>) : title}
      titleActions={recipe && itemActionsFor ? itemActionsFor(recipe.typeID) : undefined}
    >
      {recipe && (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-text-dim">
            {t('industry.buildRecipe.summary', {
              runs: formatCount(recipe.runs),
              output: formatCount(recipe.outputPerRun),
              made: formatCount(recipe.unitsMade),
              needed: formatCount(recipe.needed),
            })}{' '}
            {recipe.split &&
              t('industry.buildRecipe.split', { jobs: jobsOfRuns(t, recipe.jobRuns) })}{' '}
            {recipe.spare > 0 &&
              t('industry.buildRecipe.spare', { spare: formatCount(recipe.spare) })}
          </p>

          <section className="space-y-1.5">
            <h3 className={eyebrowClassName}>{t('industry.buildRecipe.inputsTitle')}</h3>
            <ul className="divide-y divide-line border-y border-line">
              {recipe.inputs.map((input) => (
                <Fragment key={input.typeID}>
                  {withMenu(
                    input.typeID,
                    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 text-xs">
                      <span className="inline-flex items-center gap-2">
                        {nameFor(input.typeID)}
                        {input.built && (
                          <Button size="sm" onClick={() => onOpenRecipe(input.typeID)}>
                            {t('industry.buildRecipe.action')}
                          </Button>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="tabular-nums">{formatCount(input.quantity)}</span>
                        {itemActionsFor && itemActionsFor(input.typeID)}
                      </span>
                    </li>
                  )}
                </Fragment>
              ))}
            </ul>
          </section>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-text-dim">{t('industry.buildRecipe.jobTime')}</dt>
            <dd className="tabular-nums">{formatDuration(recipe.seconds)}</dd>
            <dt className="text-text-dim">{t('industry.buildRecipe.jobFees')}</dt>
            <dd className="tabular-nums">{formatIsk(recipe.jobFees)}</dd>
            <dt className="text-text-dim">{t('industry.buildRecipe.unitCost')}</dt>
            <dd className="tabular-nums">
              {recipe.unitCost === null ? t('industry.unpriced') : formatIsk(recipe.unitCost, 2)}
            </dd>
            <dt className="text-text-dim">{t('industry.buildRecipe.me')}</dt>
            <dd className="tabular-nums">{recipe.me}</dd>
          </dl>
        </div>
      )}
    </Modal>
  );
}
