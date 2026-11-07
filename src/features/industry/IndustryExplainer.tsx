import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, SlideOver, TypeIcon } from '@/components/ui';
import { ExternalLink } from '@/components/ui/ExternalLink';
import * as Icon from '@/components/ui/icons';
import { ExplainerArrow, ExplainerRow, ExplainerSection } from '@/components/ExplainerRow';
import { loadSkills } from '@/sde/loadSde';
import {
  alphaIndustrySkills,
  type AlphaIndustrySkill,
} from '@/engine/industry/alphaIndustrySkills';

const EVE_UNI_MANUFACTURING = 'https://wiki.eveuniversity.org/Manufacturing';

/** Tritanium (a material) and the Rifter (the product): the chain's real item icons. */
const TRITANIUM = 34;
const RIFTER = 587;

/** The Alpha-trainable industry skills, read from the SDE once the drawer first opens. */
function useAlphaIndustrySkills(open: boolean): AlphaIndustrySkill[] | null {
  const [skills, setSkills] = useState<AlphaIndustrySkill[] | null>(null);
  useEffect(() => {
    if (!open || skills !== null) return;
    let cancelled = false;
    void loadSkills()
      .then(alphaIndustrySkills)
      .catch(() => [])
      .then((loaded) => {
        if (!cancelled) setSkills(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [open, skills]);
  return skills;
}

/**
 * "New to Industry?": the short manufacturing explainer in a drawer, on every
 * Industry tab. It teaches blueprint + materials → item, the two kinds of
 * blueprint, where a first one comes from, what an Alpha can train (from the
 * SDE's own Alpha caps) and what this page does for the pilot.
 */
export function IndustryExplainer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const alphaSkills = useAlphaIndustrySkills(open);
  return (
    <SlideOver open={open} onClose={onClose} title={t('industry.explainer.title')}>
      <div className="space-y-1 pb-3 text-xs">
        <p className="py-2 text-xs text-text-dim">{t('industry.explainer.intro')}</p>
        <ExplainerRow
          art={<Icon.Blueprint size={Icon.ICON_SIZE.lg} />}
          title={t('industry.explainer.blueprint')}
          body={t('industry.explainer.blueprintBody')}
        />
        <ExplainerArrow label={t('industry.explainer.plus')} />
        <ExplainerRow
          art={<TypeIcon typeId={TRITANIUM} size={32} width={28} height={28} />}
          title={t('industry.explainer.materials')}
          body={t('industry.explainer.materialsBody')}
        />
        <ExplainerArrow label={t('industry.explainer.facility')} />
        <ExplainerRow
          art={<TypeIcon typeId={RIFTER} size={32} width={28} height={28} />}
          title={t('industry.explainer.item')}
          body={t('industry.explainer.itemBody')}
        />

        <ExplainerSection title={t('industry.explainer.blueprints')} />
        <ExplainerRow
          art={<Icon.Blueprint size={Icon.ICON_SIZE.lg} />}
          title={t('industry.explainer.original')}
          body={t('industry.explainer.originalBody')}
        />
        <ExplainerRow
          art={<Icon.Blueprint size={Icon.ICON_SIZE.lg} />}
          title={t('industry.explainer.copy')}
          body={t('industry.explainer.copyBody')}
        />
        <ExplainerRow
          art={<Icon.Market size={Icon.ICON_SIZE.lg} />}
          title={t('industry.explainer.firstBlueprint')}
          body={t('industry.explainer.firstBlueprintBody')}
        />

        {alphaSkills !== null && alphaSkills.length > 0 && (
          <>
            <ExplainerSection title={t('industry.explainer.alpha')} />
            <p className="border-t border-line pt-2.5 text-xs text-text-dim">
              {t('industry.explainer.alphaIntro')}
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-text">
              {alphaSkills.map((skill) => (
                <li key={skill.typeID}>
                  {t('industry.explainer.alphaSkill', { name: skill.name, level: skill.level })}
                </li>
              ))}
            </ul>
            <p className="pb-1 text-xs text-text-dim">{t('industry.explainer.alphaRest')}</p>
          </>
        )}

        <ExplainerSection title={t('industry.explainer.thisPage')} />
        <ExplainerRow
          art={<Icon.Industry size={Icon.ICON_SIZE.lg} />}
          title={t('industry.explainer.buildPlan')}
          body={t('industry.explainer.buildPlanBody')}
        />
        <ExplainerRow
          art={<Icon.Ascending size={Icon.ICON_SIZE.lg} />}
          title={t('industry.explainer.opportunities')}
          body={t('industry.explainer.opportunitiesBody')}
        />
        <p className="border-t border-line pt-3 text-xs text-text-dim">
          {t('industry.explainer.learnMore')}{' '}
          <ExternalLink href={EVE_UNI_MANUFACTURING}>
            {t('industry.explainer.learnLink')}
          </ExternalLink>
        </p>
      </div>
    </SlideOver>
  );
}

/**
 * The header's "New to Industry?" button and the drawer it opens. Its text
 * stays at every width (DESIGN.md §6c Header controls): the words are what a
 * new pilot is looking for, and an icon alone reads as a generic tip.
 */
export function IndustryExplainerTrigger() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon={<Icon.Tip />}
        label={t('industry.newToIndustry')}
        visibleLabel={t('industry.newToIndustry')}
        labelAtEveryWidth
        onClick={() => setOpen(true)}
      />
      <IndustryExplainer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
