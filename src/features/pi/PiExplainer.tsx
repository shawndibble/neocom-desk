import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { SlideOver, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { PlanetImage } from './PlanetImage';
import { TierChip } from './DirectiveRow';

const EVE_UNI_PI = 'https://wiki.eveuniversity.org/Planetary_Industry';

/** Ionic Solutions (P0), Electrolytes (P1), Coolant (P2). */
const IONIC = 2309;
const ELECTROLYTES = 2327;
const COOLANT = 9832;

function Step({
  art,
  title,
  body,
  tier,
}: {
  art: ReactNode;
  title: string;
  body: string;
  tier?: number;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-line py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center text-text-dim">{art}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-text">{title}</p>
        <p className="text-xs text-text-dim">{body}</p>
      </div>
      {tier !== undefined && <TierChip tier={tier} />}
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <p className="py-1 pl-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
      <Icon.Descending size={Icon.ICON_SIZE.sm} aria-hidden="true" className="mr-1 inline" />
      {label}
    </p>
  );
}

function Building({ icon, name, body }: { icon: ReactNode; name: string; body: string }) {
  return (
    <div className="flex items-start gap-3 border-t border-line py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center text-text-dim">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-text">{name}</p>
        <p className="text-xs text-text-dim">{body}</p>
      </div>
    </div>
  );
}

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
        <Step
          art={<PlanetImage type="gas" size={32} />}
          title={t('piPlan.explainer.planet')}
          body={t('piPlan.explainer.planetBody')}
        />
        <Arrow label={t('piPlan.explainer.extractor')} />
        <Step
          art={<TypeIcon typeId={IONIC} size={32} width={28} height={28} />}
          title={t('piPlan.explainer.raw')}
          body={t('piPlan.explainer.rawBody')}
          tier={0}
        />
        <Arrow label={t('piPlan.explainer.factory')} />
        <Step
          art={<TypeIcon typeId={ELECTROLYTES} size={32} width={28} height={28} />}
          title={t('piPlan.explainer.processed')}
          body={t('piPlan.explainer.processedBody')}
          tier={1}
        />
        <Arrow label={t('piPlan.explainer.factory')} />
        <Step
          art={<TypeIcon typeId={COOLANT} size={32} width={28} height={28} />}
          title={t('piPlan.explainer.refined')}
          body={t('piPlan.explainer.refinedBody')}
          tier={2}
        />
        <Arrow label={t('piPlan.explainer.toMarket')} />
        <h3 className="pt-3 pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('piPlan.explainer.buildings')}
        </h3>
        <Building
          icon={<Icon.PiCommandCenter size={Icon.ICON_SIZE.lg} />}
          name={t('piPlan.explainer.commandCenter')}
          body={t('piPlan.explainer.commandCenterBody')}
        />
        <Building
          icon={<Icon.PiExtractor size={Icon.ICON_SIZE.lg} />}
          name={t('piPlan.explainer.extractorName')}
          body={t('piPlan.explainer.extractorBody')}
        />
        <Building
          icon={<Icon.PiFactory size={Icon.ICON_SIZE.lg} />}
          name={t('piPlan.explainer.factoryName')}
          body={t('piPlan.explainer.factoryBody')}
        />
        <Building
          icon={<Icon.PiLaunchpad size={Icon.ICON_SIZE.lg} />}
          name={t('piPlan.explainer.launchpad')}
          body={t('piPlan.explainer.launchpadBody')}
        />
        <Building
          icon={<Icon.PiCustomsOffice size={Icon.ICON_SIZE.lg} />}
          name={t('piPlan.explainer.customs')}
          body={t('piPlan.explainer.customsBody')}
        />
        <Building
          icon={<Icon.PiSkyhook size={Icon.ICON_SIZE.lg} />}
          name={t('piPlan.explainer.skyhook')}
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
