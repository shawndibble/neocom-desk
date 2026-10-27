import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { resolveNames } from '@/features/character/names';
import {
  answerGrouping,
  listPendingGroupings,
  type PendingGrouping,
} from '@/features/corpTaxBook/groupingApi';

interface Question extends PendingGrouping {
  /** The tracked Character being asked: the one whose own sign-in answers. */
  characterId: number;
}

/**
 * A guest signed in to the app answers a hand-made grouping here (D26b, issue
 * #4210). Each question is asked of, and answered as, the tracked Character
 * being added, so the confirm rests on that Character's own sign-in. A read
 * that fails drops the notice; the personal ledger never depends on it.
 */
export function PendingGroupingNotice({
  characters,
}: {
  characters: readonly { characterId: number; characterName: string }[];
}) {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ids = characters.map((c) => c.characterId).join(',');

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found: Question[] = [];
      for (const characterId of ids === '' ? [] : ids.split(',').map(Number)) {
        const pending = await listPendingGroupings(characterId).catch(() => []);
        found.push(...pending.map((p) => ({ ...p, characterId })));
      }
      const mains = await resolveNames([
        ...new Set(found.flatMap((q) => [q.mainCharacterId, q.corporationId])),
      ]).catch(() => new Map<number, string>());
      if (cancelled) return;
      setQuestions(found);
      setNames(mains);
    })();
    return () => {
      cancelled = true;
    };
  }, [ids, version]);

  if (questions.length === 0) return null;
  const answer = async (q: Question, how: 'confirm' | 'decline') => {
    setBusy(true);
    setFailed(false);
    try {
      await answerGrouping(q.characterId, q, how);
      setVersion((n) => n + 1);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const nameOf = (id: number) => names.get(id) ?? `#${id}`;
  const characterName = (id: number) =>
    characters.find((c) => c.characterId === id)?.characterName ?? `#${id}`;

  return (
    <Panel title={t('miningTax.corpBook.grouping.title')}>
      <ul className="space-y-3">
        {questions.map((q) => (
          <li key={`${q.characterId}:${q.corporationId}:${q.minerId}`} className="space-y-1">
            <p className="text-sm">
              {t('miningTax.corpBook.grouping.ask', {
                corp: nameOf(q.corporationId),
                name: characterName(q.characterId),
                main: nameOf(q.mainCharacterId),
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => void answer(q, 'confirm')}
              >
                {t('miningTax.corpBook.grouping.confirm', { name: characterName(q.characterId) })}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void answer(q, 'decline')}
              >
                {t('miningTax.corpBook.grouping.decline')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {failed && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {t('miningTax.corpBook.grouping.failed')}
        </p>
      )}
    </Panel>
  );
}
