import { useEffect, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
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
  NeedsConnection,
  LogoMark,
  Panel,
  Spinner,
} from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { db } from '@/db';
import { CharacterSharePicker } from '@/features/communities/SharePicker';
import { publishSharedLibrary } from '@/features/communities/libraryPush';
import { saveShareSelection } from '@/features/communities/shareSelection';
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

type JoinResult = 'joined' | 'alreadyMember' | 'pending' | 'full' | 'tooMany' | 'failed';

/** A result that is not a problem: the Character is in, or waiting for the admin. */
const isFine = (result: JoinResult) =>
  result === 'joined' || result === 'alreadyMember' || result === 'pending';

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
          setState({
            status: ['not-found', 'invalid-argument'].includes(callableErrorCode(err) ?? '')
              ? 'gone'
              : 'unavailable',
          });
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
  // Per Character: the blueprint type ids to share. Nothing until chosen.
  const [shares, setShares] = useState<Record<number, ReadonlySet<number>>>({});
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const sharedCount = (id: number) => shares[id]?.size ?? 0;
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
  const totalShared = chosen.reduce((sum, c) => sum + sharedCount(c.characterId), 0);

  async function join() {
    setWorking(true);
    const next: Record<number, JoinResult> = {};
    let communityId: string | null = null;
    const joinedIds: number[] = [];
    for (const character of chosen) {
      try {
        const joined = await joinCommunity(character.characterId, code, character.name);
        if (joined.pending) {
          // Waiting for the admin: keep the choice so the library publishes once
          // they let this Character in, but there is no Community to open yet.
          await saveShareSelection(
            character.characterId,
            joined.communityId,
            shares[character.characterId] ?? new Set()
          ).catch(() => undefined);
          next[character.characterId] = 'pending';
          continue;
        }
        communityId = joined.communityId;
        joinedIds.push(character.characterId);
        // An untouched picker on a re-join must not wipe the choice saved before.
        const chosenIds = shares[character.characterId];
        if (chosenIds || !joined.alreadyMember) {
          // The join stands even if this device can't save the choice.
          await saveShareSelection(
            character.characterId,
            joined.communityId,
            chosenIds ?? new Set()
          ).catch(() => undefined);
          void publishSharedLibrary(character.characterId, joined.communityId);
        }
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
    if (allDone && communityId && joinedIds.length > 0) {
      // /communities shows the active Character's Communities: keep it if it
      // just joined, otherwise switch to one that did.
      const active = useActiveCharacter.getState().activeCharacterId;
      if (active === null || !joinedIds.includes(active)) await setActiveCharacter(joinedIds[0]);
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
          <InlineError>{t('communities.join.unavailable')}</InlineError>
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
                      <li key={character.characterId}>
                        <div
                          className={`flex flex-wrap items-center gap-2 py-1.5 text-xs ${tappableRowClassName}`}
                        >
                          <label
                            className={`flex min-w-0 flex-1 items-center gap-2 ${tappableRowClassName}`}
                          >
                            <Checkbox
                              checked={ok && !unchecked.has(character.characterId)}
                              disabled={!ok || working}
                              aria-describedby={
                                withBlueprints !== undefined && !ok
                                  ? `needs-${character.characterId}`
                                  : undefined
                              }
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
                          {ok && (
                            <Button
                              size="sm"
                              aria-expanded={pickerFor === character.characterId}
                              disabled={working}
                              onClick={() =>
                                setPickerFor(
                                  pickerFor === character.characterId ? null : character.characterId
                                )
                              }
                            >
                              {t('communities.share.chooseCount', {
                                count: sharedCount(character.characterId),
                              })}
                            </Button>
                          )}
                          {withBlueprints !== undefined && !ok && (
                            <>
                              <span id={`needs-${character.characterId}`} className="text-text-dim">
                                {t('communities.join.needsPermission')}
                              </span>
                              <NeedsConnection>
                                <Button size="sm" onClick={() => grant(character.characterId)}>
                                  {t('communities.join.grant')}
                                </Button>
                              </NeedsConnection>
                            </>
                          )}
                          {result && (
                            <span
                              role={isFine(result) ? 'status' : 'alert'}
                              className={isFine(result) ? 'text-text-dim' : 'text-danger'}
                            >
                              {t(`communities.join.${result}`)}
                            </span>
                          )}
                        </div>
                        {ok && pickerFor === character.characterId && (
                          <div className="pb-2 pl-2">
                            <CharacterSharePicker
                              characterId={character.characterId}
                              selected={shares[character.characterId] ?? new Set()}
                              disabled={working}
                              onChange={(next) =>
                                setShares((prev) => ({ ...prev, [character.characterId]: next }))
                              }
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <NeedsConnection>
                    <Button
                      variant="primary"
                      loading={working}
                      disabled={chosen.length === 0}
                      onClick={() => void join()}
                    >
                      {t('communities.join.joinAction', { count: totalShared })}
                    </Button>
                  </NeedsConnection>
                  <NeedsConnection>
                    <Button onClick={logIn} disabled={loggingIn || working}>
                      {t('communities.join.another')}
                    </Button>
                  </NeedsConnection>
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
