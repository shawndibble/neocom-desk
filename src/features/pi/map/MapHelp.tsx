/** "How to use the map": the steps, the legend, and where to learn PI. */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { useTouchContext } from '@/lib/useMediaQuery';
import { VERDICT_TONE } from './mapText';

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className={cx(eyebrowClassName, 'mt-4 mb-1.5 first:mt-0')}>{children}</h3>;
}

function Sample({ className, children }: { className: string; children?: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid h-3.5 w-7 place-items-center rounded-xs border text-[0.6875rem] leading-none font-bold ${className}`}
    >
      {children}
    </span>
  );
}

function Line({ className }: { className: string }) {
  return <span aria-hidden="true" className={`inline-block w-7 flex-none ${className}`} />;
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
          <span aria-hidden="true" className={`w-7 text-center font-bold ${VERDICT_TONE['▲']}`}>
            ▲
          </span>
          {t('piMap.help.legend.better')}
        </li>
        <li className="flex items-center gap-2.5">
          <span aria-hidden="true" className={`w-7 text-center font-bold ${VERDICT_TONE['≈']}`}>
            ≈
          </span>
          {t('piMap.help.legend.same')}
        </li>
        <li className="flex items-center gap-2.5">
          <span aria-hidden="true" className={`w-7 text-center font-bold ${VERDICT_TONE['▼']}`}>
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
          <Sample className="border-dashed border-line" />
          {t('piMap.help.legend.ghost')}
        </li>
        <li className="flex items-center gap-2.5">
          <Line className="border-t-2 border-solid border-accent" />
          {t('piMap.help.legend.wire')}
        </li>
        <li className="flex items-center gap-2.5">
          <Line className="border-t-2 border-dashed border-accent" />
          {t('piMap.help.legend.wireSkip')}
        </li>
        <li className="flex items-center gap-2.5">
          <Line className="border-t-2 border-solid border-warning" />
          {t('piMap.help.legend.wirePlanet')}
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
