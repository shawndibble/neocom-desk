import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui';
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
  // Warnings first (stable), so the collapsed preview names the most important item.
  const ordered = [...items].sort(
    (a, b) => Number(b.tone === 'warning') - Number(a.tone === 'warning')
  );
  const warning = ordered[0].tone === 'warning';
  const first = ordered[0];
  return (
    <section
      role={warning ? 'alert' : 'status'}
      className={cx(
        'rounded-xs border text-xs',
        warning ? 'border-warning/60 bg-warning/10' : 'border-line bg-panel-2'
      )}
    >
      <Disclosure
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        label={
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cx('shrink-0', warning ? 'text-warning' : 'text-text')}>
              {t('miningTax.attention.title', { count: items.length })}
            </span>
            {!expanded && (
              <>
                <span className="min-w-0 truncate font-normal tracking-normal text-text-dim normal-case">
                  {first.title}
                </span>
                {items.length > 1 && (
                  <span className="shrink-0 font-normal tracking-normal text-text-dim normal-case">
                    {t('miningTax.attention.more', { count: items.length - 1 })}
                  </span>
                )}
              </>
            )}
          </span>
        }
        trailing={
          <span className="font-normal text-text-dim">
            {expanded ? t('miningTax.attention.hide') : t('miningTax.attention.show')}
          </span>
        }
      >
        {ordered.map((item) => (
          <div key={item.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-2.5 py-2">
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
          </div>
        ))}
      </Disclosure>
    </section>
  );
}
