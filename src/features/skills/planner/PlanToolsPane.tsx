import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, Panel } from '@/components/ui';
import { cx } from '@/lib/cx';

/** One labelled group of controls inside the tools pane. */
export interface PlanToolSection {
  /** Stable React key; not rendered. */
  id: string;
  title: string;
  content: ReactNode;
}

interface PlanToolsPaneProps {
  sections: readonly PlanToolSection[];
  /**
   * Render as a single collapsed disclosure row instead of an open panel.
   * True below `lg`, where the pane sits in the one scrolling column above
   * the entry list rather than in its own sidebar.
   */
  asDisclosure: boolean;
  className?: string;
}

/**
 * Every control that acts on the open plan — optimize/marker actions, the
 * what-if training lens, import/export — framed as one panel of labelled
 * sections instead of three sibling panels.
 *
 * The three used to be peers of the entry list, which said they mattered as
 * much as the plan itself and cost three panel header strips of chrome to
 * say it. Grouped here they read as one thing ("the plan's controls"), which
 * is what lets them fill the sidebar on a wide screen and collapse to a
 * single row on a phone.
 *
 * Framing only: the controls stay in `PlanEditor`, which owns their state.
 * Passing them in as `content` nodes keeps that state where it is rather
 * than lifting a dozen handlers into a props interface for this component.
 */
export function PlanToolsPane({ sections, asDisclosure, className }: PlanToolsPaneProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const body = sections.map((section, index) => (
    <section
      key={section.id}
      className={cx(
        'space-y-2 p-3',
        // Disclosure mode nests these in a `Disclosure`, whose `divide-y`
        // already draws a line between adjacent children — adding our own
        // bottom border there would stack two 1px hairlines into a 2px one,
        // against DESIGN.md §3's "always 1px".
        !asDisclosure && index < sections.length - 1 && 'border-b border-line'
      )}
    >
      <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {section.title}
      </h3>
      {section.content}
    </section>
  ));

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
