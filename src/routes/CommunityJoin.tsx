import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { beginGrant } from '@/app/grantAction';
import { grantCovers } from '@/app/grantCovers';
import { setLoginReturnTo } from '@/auth/loginReturnTo';
import {
  Button,
  Checkbox,
  CharacterAvatar,
  EmptyState,
  EveSsoButton,
  LogoMark,
  Panel,
  Spinner,
} from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { db } from '@/db';
import { callableErrorCode, callableErrorReason } from '@/features/communities/callableError';
import {
  joinCommunity,
  previewInvite,
  type InvitePreview,
} from '@/features/communities/communityStore';
import { useActiveCharacter } from '@/stores/activeCharacter';

type PreviewState =
  | { status: 'loading' }
  | { status: 'ok'; preview: InvitePreview }
  | { status: 'gone' }
  | { status: 'unavailable' };

type JoinResult = 'joined' | 'alreadyMember' | 'full' | 'tooMany' | 'failed';

const BLUEPRINTS = ['getCharacterBlueprints'] as const;

/**
 * The invite link's page (issue #3598, ADR 0018): outside the signed-in shell,
 * like a Share Link, so a visitor with no Neocom account sees what the link is
 * for (name, admin, Member count) before logging in. After EVE's login the
 * visitor lands back here and picks which of the device's Characters join,
 * each as its own Member. A Character that hasn't granted the blueprints scope
 * is listed as "needs permission" and runs the ordinary grant flow.
 */
export function CommunityJoin() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const navigate = useNavigate();
  useMarkPublicRouteRendered();
  const setActiveCharacter = useActiveCharacter((s) => s.setActiveCharacter);

  const [state, setState] = useState<PreviewState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const preview = await previewInvite(code);
        if (!cancelled) setState({ status: 'ok', preview });
      } catch (err) {
        if (!cancelled) {
          setState({ status: callableErrorCode(err) === 'not-found' ? 'gone' : 'unavailable' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const characters = useLiveQuery(async () =>
    (await db.characters.toArray()).sort((a, b) => a.addedAt - b.addedAt)
  );
  // Booleans only: a token never goes into React state (ADR 0001).
  const withBlueprints = useLiveQuery(async () => {
    const tokens = await db.tokens.toArray();
    return new Set(
      tokens
        .filter((token) => grantCovers(new Set(token.scopes), BLUEPRINTS))
        .map((token) => token.characterId)
    );
  });
  const [unchecked, setUnchecked] = useState<ReadonlySet<number>>(new Set());
  const [results, setResults] = useState<Record<number, JoinResult>>({});
  const [working, setWorking] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const joinPath = `/communities/join/${code}`;

  function logIn() {
    setLoggingIn(true);
    setLoginReturnTo(joinPath);
    void beginAddCharacterLogin().catch(() => setLoggingIn(false));
  }

  function grant(characterId: number) {
    setLoginReturnTo(joinPath);
    void beginGrant(characterId, BLUEPRINTS);
  }

  const eligible = (characters ?? []).filter((c) => withBlueprints?.has(c.characterId));
  const chosen = eligible.filter((c) => !unchecked.has(c.characterId));

  async function join() {
    setWorking(true);
    const next: Record<number, JoinResult> = {};
    let communityId: string | null = null;
    let firstJoined: number | null = null;
    for (const character of chosen) {
      try {
        const joined = await joinCommunity(character.characterId, code, character.name);
        communityId = joined.communityId;
        firstJoined ??= character.characterId;
        next[character.characterId] = joined.alreadyMember ? 'alreadyMember' : 'joined';
      } catch (err) {
        next[character.characterId] =
          callableErrorCode(err) === 'resource-exhausted'
            ? callableErrorReason(err) === 'community-full'
              ? 'full'
              : 'tooMany'
            : 'failed';
      }
    }
    setResults(next);
    setWorking(false);
    const allDone = chosen.every((c) => ['joined', 'alreadyMember'].includes(next[c.characterId]));
    if (allDone && communityId && firstJoined !== null) {
      await setActiveCharacter(firstJoined);
      navigate(`/communities?community=${communityId}`);
    }
  }

  const signedOut = characters !== undefined && characters.length === 0;
  const anyJoined = Object.values(results).some((r) => r === 'joined' || r === 'alreadyMember');

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-bg p-2 text-text sm:p-6">
      <header>
        <Link to="/" className="flex items-center gap-3 text-xl font-semibold tracking-wide">
          <LogoMark className="size-9" />
          {t('share.brand')}
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-4">
        <h1 className="text-sm font-semibold tracking-widest uppercase">
          {t('communities.join.title')}
        </h1>

        {state.status === 'loading' && <Spinner label={t('communities.loading')} />}
        {state.status === 'gone' && (
          <EmptyState title={t('communities.join.gone')} hint={t('communities.join.goneHint')} />
        )}
        {state.status === 'unavailable' && (
          <p role="alert" className="text-xs text-danger">
            {t('communities.join.unavailable')}
          </p>
        )}

        {state.status === 'ok' && (
          <Panel
            title={state.preview.name}
            meta={t('communities.memberCount', { count: state.preview.memberCount })}
          >
            <p className="text-xs text-text-dim">
              {t('communities.join.invitedBy', { admin: state.preview.adminName })}
            </p>
            <p className="mt-2 text-xs text-text-dim">{t('communities.join.intro')}</p>

            {signedOut && (
              <div className="mt-4 flex flex-col items-start gap-2">
                <EveSsoButton
                  size="large"
                  pending={loggingIn}
                  onClick={logIn}
                  label={t('communities.join.logIn')}
                />
                <p className="text-xs text-text-dim">{t('communities.join.logInHint')}</p>
              </div>
            )}

            {characters && characters.length > 0 && (
              <section className="mt-4" aria-label={t('communities.join.pickTitle')}>
                <h2 className="mb-1 text-xs font-semibold">{t('communities.join.pickTitle')}</h2>
                <ul className="divide-y divide-line">
                  {characters.map((character) => {
                    const ok = withBlueprints?.has(character.characterId) ?? false;
                    const result = results[character.characterId];
                    return (
                      <li
                        key={character.characterId}
                        className={`flex items-center gap-2 py-1.5 text-xs ${tappableRowClassName}`}
                      >
                        <label
                          className={`flex min-w-0 flex-1 items-center gap-2 ${tappableRowClassName}`}
                        >
                          <Checkbox
                            checked={ok && !unchecked.has(character.characterId)}
                            disabled={!ok || working}
                            onChange={(event) =>
                              setUnchecked((prev) => {
                                const next = new Set(prev);
                                if (event.target.checked) next.delete(character.characterId);
                                else next.add(character.characterId);
                                return next;
                              })
                            }
                          />
                          <CharacterAvatar characterId={character.characterId} size="sm" />
                          <span className="min-w-0 flex-1 truncate">{character.name}</span>
                        </label>
                        {withBlueprints !== undefined && !ok && (
                          <>
                            <span className="text-text-dim">
                              {t('communities.join.needsPermission')}
                            </span>
                            <Button size="sm" onClick={() => grant(character.characterId)}>
                              {t('communities.join.grant')}
                            </Button>
                          </>
                        )}
                        {result && (
                          <span
                            role={
                              result === 'joined' || result === 'alreadyMember'
                                ? undefined
                                : 'alert'
                            }
                            className={
                              result === 'joined' || result === 'alreadyMember'
                                ? 'text-text-dim'
                                : 'text-danger'
                            }
                          >
                            {t(`communities.join.${result}`)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    loading={working}
                    disabled={chosen.length === 0}
                    onClick={() => void join()}
                  >
                    {t('communities.join.joinAction', { count: chosen.length })}
                  </Button>
                  <Button onClick={logIn} disabled={loggingIn || working}>
                    {t('communities.join.another')}
                  </Button>
                  {anyJoined && (
                    <Link to="/communities" className="text-xs underline">
                      {t('communities.join.open')}
                    </Link>
                  )}
                </div>
              </section>
            )}
          </Panel>
        )}
      </main>
    </div>
  );
}
