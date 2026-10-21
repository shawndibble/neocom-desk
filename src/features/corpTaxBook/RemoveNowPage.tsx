import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { setLoginReturnTo } from '@/auth/loginReturnTo';
import { Button, EmptyState, EveSsoButton, LogoMark, Panel, Spinner } from '@/components/ui';
import { db } from '@/db';
import { eveTimeLabel } from '@/engine/corpTaxBook/removalMail';
import { useEntityName } from '@/features/character/useEntityName';
import { forceRemoval, getRemovalLink } from '@/features/corp/taxBook/feederClient';

type State =
  | { status: 'loading' }
  | {
      status: 'available';
      characterId: number;
      accounting: number;
      owner: number;
      at: number | null;
    }
  | { status: 'unavailable'; at: number | null }
  | { status: 'done'; accounting: number; owner: number }
  | { status: 'failed' };

/**
 * The payee's "Remove now" page, behind an EVE sign-in. It asks the server about the link
 * for each Character on this device and uses the first it will accept. Every reason the link
 * cannot be used (expired, already over, not this Character, or any other) reads the same
 * here: one neutral message, never why.
 */
export function RemoveNowPage({ code }: { code: string }) {
  const { t } = useTranslation();
  const characters = useLiveQuery(async () =>
    (await db.characters.toArray()).sort((a, b) => a.addedAt - b.addedAt)
  );
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [working, setWorking] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const ids = (characters ?? []).map((c) => c.characterId).join(',');

  useEffect(() => {
    if (characters === undefined || characters.length === 0) return;
    let cancelled = false;
    void (async () => {
      let at: number | null = null;
      try {
        for (const c of characters) {
          const link = await getRemovalLink(c.characterId, code);
          if (cancelled) return;
          if (link.available) {
            setState({
              status: 'available',
              characterId: c.characterId,
              accounting: link.collectorCorporationId,
              owner: link.feederCorporationId,
              at: link.effectiveAt,
            });
            return;
          }
          at = at ?? link.effectiveAt;
        }
        setState({ status: 'unavailable', at });
      } catch {
        if (!cancelled) setState({ status: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // `ids` stands for the device's Characters: the list itself changes identity on every read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, code, attempt]);

  const accountingId = 'accounting' in state ? state.accounting : undefined;
  const ownerId = 'owner' in state ? state.owner : undefined;
  const accounting = useEntityName(accountingId) ?? t('corpTaxBook.removeNow.theAccounting');
  const owner = useEntityName(ownerId) ?? t('corpTaxBook.removeNow.theOwner');

  async function remove(characterId: number) {
    setWorking(true);
    try {
      const result = await forceRemoval(characterId, code);
      const prior = state.status === 'available' ? state : null;
      setState(
        result.ended && prior
          ? { status: 'done', accounting: prior.accounting, owner: prior.owner }
          : { status: 'unavailable', at: result.effectiveAt }
      );
    } catch {
      setState({ status: 'failed' });
    } finally {
      setWorking(false);
    }
  }

  function logIn() {
    setLoggingIn(true);
    setLoginReturnTo(`/corp-tax-book/remove-now/${code}`);
    void beginAddCharacterLogin().catch(() => setLoggingIn(false));
  }

  const signedOut = characters !== undefined && characters.length === 0;
  const k = (key: string) => `corpTaxBook.removeNow.${key}`;
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-bg p-2 text-text sm:p-6">
      <header className="flex items-center gap-3 text-xl font-semibold tracking-wide">
        <LogoMark className="size-9" />
        {t('share.brand')}
      </header>
      <main className="flex flex-1 flex-col gap-4">
        <h1 className="text-sm font-semibold tracking-widest uppercase">{t(k('title'))}</h1>
        {signedOut ? (
          <Panel>
            <div className="space-y-3 text-sm">
              <p>{t(k('signIn'))}</p>
              <EveSsoButton
                size="large"
                pending={loggingIn}
                onClick={logIn}
                label={t(k('login'))}
              />
            </div>
          </Panel>
        ) : state.status === 'loading' ? (
          <Spinner label={t(k('checking'))} />
        ) : state.status === 'available' ? (
          <Panel>
            <div className="space-y-3 text-sm">
              <p>
                {state.at === null
                  ? t(k('introNoTime'), { accounting, owner })
                  : t(k('intro'), { accounting, owner, time: eveTimeLabel(state.at) })}
              </p>
              <p className="text-text-dim">{t(k('hint'), { accounting, owner })}</p>
              <Button
                variant="danger"
                disabled={working}
                onClick={() => void remove(state.characterId)}
              >
                {t(k('confirm'))}
              </Button>
            </div>
          </Panel>
        ) : state.status === 'done' ? (
          <p role="status" className="text-sm">
            {t(k('done'), { accounting, owner })}
          </p>
        ) : state.status === 'unavailable' ? (
          <EmptyState
            title={
              state.at === null
                ? t(k('unavailableNoTime'))
                : t(k('unavailable'), { time: eveTimeLabel(state.at) })
            }
          />
        ) : (
          <EmptyState
            title={t(k('failed'))}
            action={
              <Button
                size="sm"
                onClick={() => {
                  setState({ status: 'loading' });
                  setAttempt((n) => n + 1);
                }}
              >
                {t(k('retry'))}
              </Button>
            }
          />
        )}
      </main>
    </div>
  );
}
