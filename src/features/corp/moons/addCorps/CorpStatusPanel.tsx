import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InlineError } from '@/components/ui/InlineError';
import { Button, Panel } from '@/components/ui';
import { addCorpsErrorText } from '../addCorpsErrorText';
import type { NeedsYouItem } from './addCorpsStatus';
import { CorpStatePill } from './CorpRow';

const k = (key: string) => `corpTaxBook.moons.addCorps.needs.${key}`;

/**
 * "Needs you (N)": every corp of the player's that did not end up connected,
 * with the one-line reason and the fix that applies. Gone quiet is removed from
 * here; sign-in problems start that corp's sign-in again; a corp with its own
 * book has only the instruction, because moving a book is not built yet.
 * Renders nothing when the list is empty.
 */
export function CorpStatusPanel({
  items,
  connected,
  total,
  onSignInAgain,
  onRemove,
}: {
  items: readonly NeedsYouItem[];
  /** The run's tally for the meta line; omit when no run is kept. */
  connected?: number;
  total?: number;
  onSignInAgain: (corporationId: number) => void;
  /** Resolves `false` when the removal was refused. */
  onRemove: (corporationId: number) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState<number | null>(null);
  const [failedId, setFailedId] = useState<number | null>(null);
  if (items.length === 0) return null;
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
      title={t(k('title'), { count: items.length })}
      {...(connected !== undefined && total !== undefined
        ? { meta: t(k('meta'), { connected, total }) }
        : {})}
    >
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.corporationId} className="space-y-1 py-2 text-sm">
            <div className="flex items-start justify-between gap-2 sm:items-center">
              <span className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="max-w-full truncate font-medium">{item.name}</span>
                <CorpStatePill state={item.state} />
              </span>
              {item.state === 'gone-quiet' ? (
                <Button
                  size="sm"
                  variant="danger"
                  loading={removing === item.corporationId}
                  aria-label={t(k('removeNamed'), { name: item.name })}
                  onClick={() => remove(item.corporationId)}
                >
                  {t(k('gone-quiet.action'))}
                </Button>
              ) : item.state === 'own-book' ? null : (
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
              {item.reason ? addCorpsErrorText(t, item.reason) : t(k(`${item.state}.text`))}
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
