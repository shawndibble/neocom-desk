import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui/textActionClassName';
import type { Resource } from '@/engine/fittings/makeItFit';
import { MakeItFitSection } from './MakeItFitSection';

interface Props {
  resources: readonly Resource[];
  /** Opens Make it fit on that budget. */
  onFixFirst: (resource: Resource) => void;
}

/** A fit that doesn't fit has nothing to improve yet: hand over to Make it fit (`20261019-144736`). */
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
