import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import type { BuildRecipe } from './subBuildPlan';

interface BuildRecipeModalProps {
  /** The recipe to show; `null` closes the modal — the parent holds which material is open. */
  recipe: BuildRecipe | null;
  onClose: () => void;
  nameFor: (typeID: number) => string;
  /** Swaps the modal to an input's own recipe — how the tree is walked now the table is flat. */
  onOpenRecipe: (typeID: number) => void;
}

/**
 * How to actually make one material, for the quantity this plan needs.
 *
 * The materials table is a flat shopping list — one row per material, summed
 * over every branch that wants it (`subBuildPlan`) — which is what makes it
 * readable, and which costs exactly one thing: you can no longer see which
 * job a quantity came from. This is where that goes. A row marked to be built
 * carries a "Build it" button, and this answers it: how many runs, what they
 * yield, and the ingredient list for all of them together.
 *
 * The quantities here are the *jobs'* quantities, not the table's. They differ
 * whenever runs round up past what was asked for (EVE sizes jobs in whole
 * runs), and that difference is the point — the table says what the plan
 * needs, this says what you have to feed the machine to get it.
 *
 * The nesting the table gave up is walked here instead, one material per view:
 * an input that is itself being built has its own "Build it", which swaps this
 * modal to that material's recipe rather than indenting a second list inside
 * the first. One level on screen at a time, however deep the plan goes.
 */
export function BuildRecipeModal({
  recipe,
  onClose,
  nameFor,
  onOpenRecipe,
}: BuildRecipeModalProps) {
  const { t } = useTranslation();
  const name = recipe ? nameFor(recipe.typeID) : '';

  return (
    <Modal
      open={recipe !== null}
      onClose={onClose}
      title={t('industry.buildRecipe.title', { material: name })}
    >
      {recipe && (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-text-dim">
            {t('industry.buildRecipe.summary', {
              runs: recipe.runs.toLocaleString(),
              output: recipe.outputPerRun.toLocaleString(),
              made: recipe.unitsMade.toLocaleString(),
              needed: recipe.needed.toLocaleString(),
            })}{' '}
            {recipe.spare > 0 &&
              t('industry.buildRecipe.spare', { spare: recipe.spare.toLocaleString() })}
          </p>

          <section className="space-y-1.5">
            <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('industry.buildRecipe.inputsTitle')}
            </h3>
            {/*
              A list, not a `DataTable`: three columns of headers over at most
              a handful of ingredients is more chrome than content, and the
              quantity is the only number being read here.
            */}
            <ul className="divide-y divide-line border-y border-line">
              {recipe.inputs.map((input) => (
                <li
                  key={input.typeID}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 text-xs"
                >
                  <span className="inline-flex items-center gap-2">
                    {nameFor(input.typeID)}
                    {input.built && (
                      <Button size="sm" onClick={() => onOpenRecipe(input.typeID)}>
                        {t('industry.buildRecipe.action')}
                      </Button>
                    )}
                  </span>
                  <span className="tabular-nums">{input.quantity.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </section>

          {/*
            What the jobs cost and take, beneath the ingredients rather than
            above them: the ingredient list is the answer to "how do I make
            these", and everything here is a caption on it.
          */}
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
