import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { SlideOver, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { ExplainerArrow, ExplainerRow, ExplainerSection } from '@/components/ExplainerRow';
import { PlanetImage } from './PlanetImage';
import { TierChip } from './DirectiveRow';

const EVE_UNI_PI = 'https://wiki.eveuniversity.org/Planetary_Industry';

/** Ionic Solutions (P0), Electrolytes (P1), Coolant (P2). */
const IONIC = 2309;
const ELECTROLYTES = 2327;
const COOLANT = 9832;

/**
 * "New to PI?": the 60-second explainer in a drawer, shared by every PI tab.
 * It teaches the P0 to P1 to P2 chain with real item icons, then names each
 * building a pilot meets in a colony.
 */
export function PiExplainer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <SlideOver open={open} onClose={onClose} title={t('piPlan.explainer.title')}>
      <div className="space-y-1 pb-3 text-xs">
        <p className="py-2 text-xs text-text-dim">{t('piPlan.explainer.intro')}</p>
        <ExplainerRow
          art={<PlanetImage type="gas" size={32} />}
          title={t('piPlan.explainer.planet')}
          body={t('piPlan.explainer.planetBody')}
        />
        <ExplainerArrow label={t('piPlan.explainer.extractor')} />
        <ExplainerRow
          art={<TypeIcon typeId={IONIC} size={32} width={28} height={28} />}
          title={t('piPlan.explainer.raw')}
          body={t('piPlan.explainer.rawBody')}
          trailing={<TierChip tier={0} />}
        />
        <ExplainerArrow label={t('piPlan.explainer.factory')} />
        <ExplainerRow
          art={<TypeIcon typeId={ELECTROLYTES} size={32} width={28} height={28} />}
          title={t('piPlan.explainer.processed')}
          body={t('piPlan.explainer.processedBody')}
          trailing={<TierChip tier={1} />}
        />
        <ExplainerArrow label={t('piPlan.explainer.factory')} />
        <ExplainerRow
          art={<TypeIcon typeId={COOLANT} size={32} width={28} height={28} />}
          title={t('piPlan.explainer.refined')}
          body={t('piPlan.explainer.refinedBody')}
          trailing={<TierChip tier={2} />}
        />
        <ExplainerArrow label={t('piPlan.explainer.toMarket')} />
        <ExplainerSection title={t('piPlan.explainer.buildings')} />
        <ExplainerRow
          art={<Icon.PiCommandCenter size={Icon.ICON_SIZE.lg} />}
          title={t('piPlan.explainer.commandCenter')}
          body={t('piPlan.explainer.commandCenterBody')}
        />
        <ExplainerRow
          art={<Icon.PiExtractor size={Icon.ICON_SIZE.lg} />}
          title={t('piPlan.explainer.extractorName')}
          body={t('piPlan.explainer.extractorBody')}
        />
        <ExplainerRow
          art={<Icon.PiFactory size={Icon.ICON_SIZE.lg} />}
          title={t('piPlan.explainer.factoryName')}
          body={t('piPlan.explainer.factoryBody')}
        />
        <ExplainerRow
          art={<Icon.PiLaunchpad size={Icon.ICON_SIZE.lg} />}
          title={t('piPlan.explainer.launchpad')}
          body={t('piPlan.explainer.launchpadBody')}
        />
        <ExplainerRow
          art={<Icon.PiCustomsOffice size={Icon.ICON_SIZE.lg} />}
          title={t('piPlan.explainer.customs')}
          body={t('piPlan.explainer.customsBody')}
        />
        <ExplainerRow
          art={<Icon.PiSkyhook size={Icon.ICON_SIZE.lg} />}
          title={t('piPlan.explainer.skyhook')}
          body={t('piPlan.explainer.skyhookBody')}
        />
        <p className="border-t border-line pt-3 text-xs text-text-dim">
          {t('piPlan.explainer.onePlanet')}
        </p>
        <p className="text-xs text-text-dim">
          {t('piPlan.explainer.learnMore')}{' '}
          <ExternalLink href={EVE_UNI_PI}>{t('piPlan.explainer.learnLink')}</ExternalLink>
        </p>
      </div>
    </SlideOver>
  );
}
