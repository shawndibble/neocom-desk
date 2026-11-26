import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, Panel } from '@/components/ui';
import { cx } from '@/lib/cx';

export interface PlanToolSection {
  id: string;
  title: string;
  content?: ReactNode;
  hideTitle?: boolean;
  actions?: ReactNode;
  group?: { summary: string; sections: readonly PlanToolSection[] };
}

interface PlanToolsPaneProps {
  sections: readonly PlanToolSection[];
  asDisclosure: boolean;
  className?: string;
}

export function PlanToolsPane({ sections, asDisclosure, className }: PlanToolsPaneProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());

  const renderSection = (section: PlanToolSection, bordered: boolean) => {
    const { group } = section;
    if (group) {
      return (
        <Disclosure
          key={section.id}
          label={section.title}
          trailing={group.summary}
          expanded={openGroups.has(section.id)}
          onToggle={() =>
            setOpenGroups((current) => {
              const next = new Set(current);
              if (!next.delete(section.id)) next.add(section.id);
              return next;
            })
          }
        >
          {group.sections.map((inner) => renderSection(inner, false))}
        </Disclosure>
      );
    }
    return (
      <section key={section.id} className={cx('space-y-2 p-3', bordered && 'border-b border-line')}>
        {!section.hideTitle && (
          <div className="flex items-center justify-between gap-2">
            <h3 className={eyebrowClassName}>{section.title}</h3>
            {section.actions}
          </div>
        )}
        {section.content}
      </section>
    );
  };

  const body = sections.map((section, index) =>
    renderSection(section, !asDisclosure && index < sections.length - 1)
  );

  if (asDisclosure) {
    return (
      <Panel className={className} padded={false}>
        <Disclosure
          label={t('plans.tools')}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        >
          {body}
        </Disclosure>
      </Panel>
    );
  }

  return (
    <Panel title={t('plans.tools')} padded={false} className={className}>
      {body}
    </Panel>
  );
}
