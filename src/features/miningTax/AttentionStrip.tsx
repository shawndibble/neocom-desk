import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret } from '@/components/ui';
import { cx } from '@/lib/cx';

export interface AttentionItem {
  id: string;
  /** `warning` understates or hides money; `info` is worth knowing but changes no figure. */
  tone: 'warning' | 'info';
  title: ReactNode;
  detail?: ReactNode;
  /** The one control that fixes it, right of the text. */
  action?: ReactNode;
}

/**
 * Every Tax-tab warning in one collapsible strip (scope decision 20261004,
 * "one attention strip"): re-login, unpriced ore, sell-price fallback,
 * duplicate Assignments and unclassified ore used to stack as five
 * full-width banners above the ledger, pushing what the pilot owes off a
 * phone screen. Each keeps its own row and action here, and a fixed problem
 * simply drops out of the list. Collapsed by default: the header still
 * counts what needs attention, so nothing is hidden silently.
 */
export function AttentionStrip({ items }: { items: readonly AttentionItem[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const warning = items.some((item) => item.tone === 'warning');
  return (
    <section
      role={warning ? 'alert' : 'status'}
      className={cx(
        'rounded-xs border text-xs',
        warning ? 'border-warning/60 bg-warning/10' : 'border-line bg-panel-2'
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className={cx(
          'flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 text-left font-semibold uppercase focus-visible:outline-2 focus-visible:outline-accent md:min-h-0',
          warning ? 'text-warning' : 'text-text'
        )}
      >
        <Caret expanded={expanded} />
        <span className="flex-1">{t('miningTax.attention.title', { count: items.length })}</span>
        <span className="text-[0.6875rem] font-medium tracking-wider text-text-dim normal-case">
          {expanded ? t('miningTax.attention.hide') : t('miningTax.attention.show')}
        </span>
      </button>
      {expanded && (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-2.5 py-2">
              <div className="min-w-0 flex-1 space-y-1">
                <p
                  className={cx(
                    'font-semibold',
                    item.tone === 'warning' ? 'text-warning' : 'text-text'
                  )}
                >
                  {item.title}
                </p>
                {item.detail && <div className="space-y-1 text-text-dim">{item.detail}</div>}
              </div>
              {item.action && <div className="flex shrink-0 flex-wrap gap-1.5">{item.action}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
