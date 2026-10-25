import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  isSectionExpanded,
  useStatsSectionsPreference,
  withSectionExpanded,
} from '../statsSectionsPreference';
import { StatsGroupLabel } from '../StatsScopePanels';
import { OPEN_BY_DEFAULT, type Section } from './sectionIds';
import { StatSection } from './StatSection';

export type SectionBuilder = (
  id: Section,
  meta: ReactNode,
  body: ReactNode,
  warning?: string,
  /** `h3` for a section in a side panel, under the panel's own title. */
  level?: 'h3' | 'h4'
) => ReactNode;

/**
 * Builders for the stats column's collapsible sections. Which are open is the
 * pilot's own layout, kept on this device (`statsSectionsPreference.ts`); an
 * untouched one opens as OPEN_BY_DEFAULT says on desktop and starts collapsed
 * on a phone.
 */
export function useSectionBuilder() {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const storedSections = useStatsSectionsPreference((state) => state.value);
  const setSections = useStatsSectionsPreference((state) => state.setValue);
  useHydratedStore(useStatsSectionsPreference);
  const isExpanded = (section: Section) =>
    isSectionExpanded(storedSections, section, {
      isPhone,
      openByDefault: OPEN_BY_DEFAULT.has(section),
    });
  const toggle = (section: Section) =>
    // From the store's current value, never this render's possibly stale copy.
    void setSections(
      withSectionExpanded(
        useStatsSectionsPreference.getState().value,
        section,
        !isExpanded(section)
      )
    );

  const section: SectionBuilder = (id, meta, body, warning, level = 'h4') => (
    <StatSection
      key={id}
      id={id}
      title={t(`fittings.stats.section.${id}`)}
      meta={meta}
      warning={warning}
      expanded={isExpanded(id)}
      onToggle={() => toggle(id)}
      level={level}
    >
      {body}
    </StatSection>
  );

  /** A column group: its label over the sections it shows, nothing when it shows none. */
  function group(id: 'damageTank' | 'ship', sections: ReactNode[]) {
    const shown = sections.filter(Boolean);
    if (shown.length === 0) return null;
    return (
      <Fragment key={id}>
        <StatsGroupLabel>{t(`fittings.stats.group.${id}`)}</StatsGroupLabel>
        {shown}
      </Fragment>
    );
  }

  return { isExpanded, section, group };
}
