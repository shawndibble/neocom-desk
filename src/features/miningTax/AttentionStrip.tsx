import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui';
import { cx } from '@/lib/cx';

export interface AttentionItem {
  id: string;
  tone: 'warning' | 'info';
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}

export function AttentionStrip({ items }: { items: readonly AttentionItem[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
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
            <div className="min-w-0 flex-[1_1_16rem] space-y-1">
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
