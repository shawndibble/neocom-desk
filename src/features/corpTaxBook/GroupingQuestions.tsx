import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { beginCustomizedAddCharacterLogin } from '@/app/loginFlow';
import { setLoginReturnTo } from '@/auth/loginReturnTo';
import { currentRouterPath } from '@/app/routerPath';
import { db } from '@/db';
import { resolveNames } from '@/features/character/names';
import { confirmPendingInCorporation, declineByVerifyLink } from './groupingApi';

type Answer = 'confirmed' | 'declined';

/**
 * The verify page's grouping question (D26b, issue #4210): an officer put a
 * character in this Miner's group, and that character has not agreed yet.
 *
 * The link alone proves the mail reached the main, not that the added
 * character is theirs, so it can only decline. Confirming needs that
 * character's own EVE sign-in: the button logs in as it (returning here) and,
 * once it is signed in on this device, confirms as it.
 */
export function GroupingQuestions({
  token,
  corporationId,
  corp,
  characterIds,
}: {
  token: string;
  corporationId: number;
  corp: string;
  characterIds: readonly number[];
}) {
  const { t } = useTranslation();
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [signedIn, setSignedIn] = useState<ReadonlySet<number>>(new Set());
  const [answers, setAnswers] = useState<ReadonlyMap<number, Answer>>(new Map());
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveNames([...characterIds]).then(
      (found) => {
        if (!cancelled) setNames(found);
      },
      () => undefined
    );
    db.characters.toArray().then(
      (rows) => {
        if (!cancelled) setSignedIn(new Set(rows.map((r) => r.characterId)));
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [characterIds]);

  const run = async (characterId: number, answer: Answer | 'login') => {
    setFailed(null);
    setBusy(characterId);
    try {
      if (answer === 'login') {
        setLoginReturnTo(currentRouterPath());
        await beginCustomizedAddCharacterLogin([]);
        return;
      }
      if (answer === 'confirmed') await confirmPendingInCorporation(characterId, corporationId);
      else await declineByVerifyLink(token, characterId);
      setAnswers((held) => new Map(held).set(characterId, answer));
    } catch {
      setFailed(characterId);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title={t('corpTaxBook.verify.grouping.title')}>
      <p className="text-sm">{t('corpTaxBook.verify.grouping.intro', { corp })}</p>
      <ul className="mt-3 space-y-3">
        {characterIds.map((id) => {
          const name = names.get(id) ?? `#${id}`;
          const answered = answers.get(id);
          return (
            <li key={id} className="space-y-1">
              <p className="text-sm font-semibold">{name}</p>
              {answered ? (
                <p className="text-sm text-text-dim" role="status">
                  {t(`corpTaxBook.verify.grouping.${answered}`, { name })}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy !== null}
                      onClick={() => void run(id, signedIn.has(id) ? 'confirmed' : 'login')}
                    >
                      {signedIn.has(id)
                        ? t('corpTaxBook.verify.grouping.confirm', { name })
                        : t('corpTaxBook.verify.grouping.signIn', { name })}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => void run(id, 'declined')}
                    >
                      {t('corpTaxBook.verify.grouping.decline')}
                    </Button>
                  </div>
                  {!signedIn.has(id) && (
                    <p className="text-xs text-text-dim">
                      {t('corpTaxBook.verify.grouping.whySignIn')}
                    </p>
                  )}
                </>
              )}
              {failed === id && (
                <p role="alert" className="text-xs text-danger">
                  {t('corpTaxBook.verify.grouping.failed')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
