/**
 * Item Detail's description, clamped to two lines so the lore never pushes the
 * stats below the fold, with a More / Less text action (DESIGN.md §6c) that
 * shows the rest in place. The action only appears when the text overflows
 * the clamp, measured live so a resize that lets it fit drops it again. Held
 * to a readable line length (`max-w-[80ch]`) however wide the modal is.
 */
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui';
import { EveMarkupText } from '@/components/EveMarkupText';

export function ItemDescription({ markup }: { markup: string }) {
  const { t } = useTranslation();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Show info swaps the open modal to another item without remounting it.
  const [shownFor, setShownFor] = useState(markup);
  if (shownFor !== markup) {
    setShownFor(markup);
    setExpanded(false);
  }

  useLayoutEffect(() => {
    const text = ref.current?.firstElementChild;
    if (!text || expanded) return;
    const measure = () => setOverflows(text.scrollHeight > text.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(text);
    return () => observer.disconnect();
  }, [expanded, markup]);

  return (
    <div className="max-w-[80ch] text-xs">
      <div ref={ref} id={id}>
        <EveMarkupText
          markup={markup}
          className={expanded ? 'text-text' : 'line-clamp-2 text-text'}
        />
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((open) => !open)}
          className={textActionClassName('mt-1 w-fit')}
        >
          {expanded
            ? t('market.itemDetail.descriptionLess')
            : t('market.itemDetail.descriptionMore')}
        </button>
      )}
    </div>
  );
}
