/** "How to use the map": the steps, the legend, and where to learn PI. */
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { useTouchContext } from '@/lib/useMediaQuery';

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 mb-1.5 text-[11px] font-semibold tracking-widest text-text-dim uppercase first:mt-0">
      {children}
    </h3>
  );
}

function Sample({ className, children }: { className: string; children?: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid h-3.5 w-7 place-items-center rounded-xs border text-[11px] leading-none font-bold ${className}`}
    >
      {children}
    </span>
  );
}

export function MapHelp() {
  const { t } = useTranslation();
  const context = useTouchContext();
  return (
    <div className="text-xs text-text-dim">
      <Heading>{t('piMap.help.stepsHeading')}</Heading>
      <ol className="list-decimal space-y-1.5 pl-4 leading-relaxed">
        {(['tick', 'read', 'trace', 'try'] as const).map((step) => (
          <li key={step}>
            <b className="text-text">{t(`piMap.help.steps.${step}.title`, { context })}</b>{' '}
            {t(`piMap.help.steps.${step}.body`, { context })}
          </li>
        ))}
      </ol>

      <Heading>{t('piMap.help.legendHeading')}</Heading>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2.5">
          <span aria-hidden="true" className="w-7 text-center font-bold text-success">
            ▲
          </span>
          {t('piMap.help.legend.better')}
        </li>
        <li className="flex items-center gap-2.5">
          <span aria-hidden="true" className="w-7 text-center font-bold text-text-dim">
            ≈
          </span>
          {t('piMap.help.legend.same')}
        </li>
        <li className="flex items-center gap-2.5">
          <span aria-hidden="true" className="w-7 text-center font-bold text-danger">
            ▼
          </span>
          {t('piMap.help.legend.worse')}
        </li>
        <li className="flex items-center gap-2.5">
          <Sample className="border-warning text-warning">#1</Sample>
          {t('piMap.help.legend.pick')}
        </li>
        <li className="flex items-center gap-2.5">
          <Sample className="border-accent-dim bg-accent/12" />
          {t('piMap.help.legend.chain')}
        </li>
        <li className="flex items-center gap-2.5">
          <Sample className="border-map-whatif bg-map-whatif/12 text-map-whatif">
            <Icon.Increase size="10" aria-hidden="true" />
          </Sample>
          {t('piMap.help.legend.whatIf')}
        </li>
        <li className="flex items-center gap-2.5">
          <Sample className="border-transparent bg-panel-2/60" />
          {t('piMap.help.legend.ghost')}
        </li>
      </ul>
      <p className="mt-3 leading-snug">{t('piMap.help.numbers')}</p>

      <Heading>{t('piMap.help.learnHeading')}</Heading>
      <ul className="space-y-1.5">
        <li>
          <ExternalLink href="https://wiki.eveuniversity.org/Planetary_Industry">
            {t('piMap.help.eveUniPi')}
          </ExternalLink>
        </li>
        <li>
          <ExternalLink href="https://wiki.eveuniversity.org/Planetary_Commodities">
            {t('piMap.help.eveUniCommodities')}
          </ExternalLink>
        </li>
      </ul>
    </div>
  );
}
