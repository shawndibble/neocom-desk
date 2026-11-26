import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InlineError } from '@/components/ui/InlineError';
import { Button, Panel } from '@/components/ui';
import { addCorpsErrorText } from '../addCorpsErrorText';
import {
  needsThePlayer,
  offersGrantAgain,
  offersLoginAgain,
  type NeedsYouItem,
} from './addCorpsStatus';
import { CorpCeo, CorpStatePill } from './CorpRow';

const k = (key: string) => `corpTaxBook.moons.addCorps.needs.${key}`;

export function CorpStatusPanel({
  items,
  connected,
  total,
  onSignInAgain,
  onGrantAgain,
  onRemove,
}: {
  items: readonly NeedsYouItem[];
  connected?: number;
  total?: number;
  onSignInAgain: (corporationId: number) => void;
  onGrantAgain: (corporationId: number) => void;
  onRemove: (corporationId: number) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState<number | null>(null);
  const [failedId, setFailedId] = useState<number | null>(null);
  if (items.length === 0) return null;
  const count = items.filter(needsThePlayer).length;
  const remove = (id: number) => {
    setRemoving(id);
    setFailedId(null);
    onRemove(id)
      .then((ok) => !ok && setFailedId(id))
      .catch(() => setFailedId(id))
      .finally(() => setRemoving(null));
  };
  return (
    <Panel
      title={count > 0 ? t(k('title'), { count }) : t(k('titleInfo'))}
      {...(connected !== undefined && total !== undefined
        ? { meta: t(k('meta'), { connected, total }) }
        : {})}
    >
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.corporationId} className="space-y-1 py-2 text-sm">
            <div
              className={`flex items-start justify-between gap-2 sm:items-center ${
                offersLoginAgain(item) ? 'flex-wrap sm:flex-nowrap' : ''
              }`}
            >
              <span className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="max-w-full truncate font-medium">{item.name}</span>
                <CorpStatePill state={item.state} />
                {item.ceoName && <CorpCeo name={item.ceoName} />}
              </span>
              {item.state === 'gone-quiet' ? (
                <span
                  className={`flex shrink-0 items-center gap-2 ${
                    offersLoginAgain(item) ? 'w-full justify-end sm:w-auto' : ''
                  }`}
                >
                  {offersLoginAgain(item) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t(k('signInNamed'), { name: item.name })}
                      onClick={() => onGrantAgain(item.corporationId)}
                    >
                      {t(k('gone-quiet.login'))}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    loading={removing === item.corporationId}
                    aria-label={t(k('removeNamed'), { name: item.name })}
                    onClick={() => remove(item.corporationId)}
                  >
                    {t(k('gone-quiet.action'))}
                  </Button>
                </span>
              ) : offersGrantAgain(item) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t(k('grantNamed'), { name: item.name })}
                  onClick={() => onGrantAgain(item.corporationId)}
                >
                  {t(k(`${item.state}.action`))}
                </Button>
              ) : item.state === 'own-book' || item.state === 'names-not-shared' ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t(k('signInNamed'), { name: item.name })}
                  onClick={() => onSignInAgain(item.corporationId)}
                >
                  {t(k(`${item.state}.action`))}
                </Button>
              )}
            </div>
            <p className="text-xs text-text-dim">
              {item.reason
                ? addCorpsErrorText(t, item.reason)
                : t(k(item.alsoOre ? 'needs-names.textBoth' : `${item.state}.text`), {
                    name: item.name,
                  })}
            </p>
            {item.state === 'failed' && item.reason && (
              <p className="text-xs text-text-dim">
                {t(k('failed.code'), { reason: item.reason })}
              </p>
            )}
            {item.state === 'gone-quiet' && (
              <p className="text-xs text-text-dim">{t(k('gone-quiet.keeps'))}</p>
            )}
            {failedId === item.corporationId && <InlineError>{t(k('removeFailed'))}</InlineError>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
