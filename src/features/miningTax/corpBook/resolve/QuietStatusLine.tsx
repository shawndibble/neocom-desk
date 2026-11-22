import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { plainTextActionClassName } from '@/components/ui';

const textAction = plainTextActionClassName('min-h-9 md:min-h-6');

interface Props {
  /** Days and Late notices the member has told a corporation about, not yet answered. */
  waiting: number;
  /** What the member chose not to pay, by key, with a label to read it by. */
  notPaying: readonly { key: string; label: string }[];
  onShow: (key: string) => void;
}

/**
 * Everything the member has answered, out of the attention strip and into one quiet line
 * (resolving in the app): waiting on the corporation, and not paying. Never gone — "Show them"
 * lists them, and a hidden one comes back with one click. Nothing when there is neither.
 */
export function QuietStatusLine({ waiting, notPaying, onShow }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (waiting === 0 && notPaying.length === 0) return null;
  return (
    <div className="space-y-1 text-xs text-text-dim">
      <p className="flex flex-wrap items-baseline gap-x-3">
        {waiting > 0 && <span>{t('miningTax.resolve.quiet.waiting', { count: waiting })}</span>}
        {notPaying.length > 0 && (
          <span>{t('miningTax.resolve.quiet.notPaying', { count: notPaying.length })}</span>
        )}
        {notPaying.length > 0 && (
          <button
            type="button"
            className={textAction}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? t('miningTax.resolve.quiet.hide') : t('miningTax.resolve.quiet.show')}
          </button>
        )}
      </p>
      {open && (
        <ul className="space-y-0.5 pl-3">
          {notPaying.map((item) => (
            <li key={item.key} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-text">{item.label}</span>
              <button
                type="button"
                className={textAction}
                aria-label={t('miningTax.resolve.quiet.showAgainNamed', { item: item.label })}
                onClick={() => onShow(item.key)}
              >
                {t('miningTax.resolve.quiet.showAgain')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
