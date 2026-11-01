import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{item.name}</span>
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
            {item.state === 'gone-quiet' && (
              <p className="text-xs text-text-dim">{t(k('gone-quiet.keeps'))}</p>
            )}
            {failedId === item.corporationId && (
              <p role="alert" className="text-xs text-danger">
                {t(k('removeFailed'))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
