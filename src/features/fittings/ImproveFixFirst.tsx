import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui/textActionClassName';
import type { Resource } from '@/engine/fittings/makeItFit';
import { MakeItFitSection } from './MakeItFitSection';

interface Props {
  resources: readonly Resource[];
  onFixFirst: (resource: Resource) => void;
}

export function ImproveFixFirst({ resources, onFixFirst }: Props) {
  const { t } = useTranslation();
  return (
    <MakeItFitSection heading={t('fittings.improve.section.fixFirst')}>
      <p className="text-sm">{t('fittings.improve.fixFirst')}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        {resources.map((resource) => (
          <button
            key={resource}
            type="button"
            className={textActionClassName()}
            onClick={() => onFixFirst(resource)}
          >
            {t(`fittings.makeItFit.fix.${resource}`)}
          </button>
        ))}
      </div>
    </MakeItFitSection>
  );
}
