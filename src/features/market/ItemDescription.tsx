import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui';
import { EveMarkupText } from '@/components/EveMarkupText';

export function ItemDescription({ markup, full = false }: { markup: string; full?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const [shownFor, setShownFor] = useState(markup);
  if (shownFor !== markup) {
    setShownFor(markup);
    setExpanded(false);
  }

  useLayoutEffect(() => {
    const text = ref.current?.firstElementChild;
    if (!text || expanded || full) return;
    const measure = () => setOverflows(text.scrollHeight > text.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(text);
    return () => observer.disconnect();
  }, [expanded, full, markup]);

  return (
    <div className="max-w-[80ch] text-xs">
      <div ref={ref} id={id}>
        <EveMarkupText
          markup={markup}
          className={expanded || full ? 'text-text' : 'line-clamp-2 text-text'}
        />
      </div>
      {!full && (overflows || expanded) && (
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
