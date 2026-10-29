import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import { useTranslation } from 'react-i18next';
import { onReconnect, useOnline } from '@/stores/network';
import { useCharacterCountOrLoading } from '@/features/character/useCharacters';
import {
  Button,
  EmptyState,
  LiveStatus,
  Spinner,
  StatChip,
  StatChips,
  TypeIcon,
} from '@/components/ui';
import { ShareShell } from '@/features/share/ShareShell';
import { writeToClipboard } from '@/lib/clipboard';
import { typeNameOr } from '@/lib/typeNameOr';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { fittingEditLocation } from '@/features/fittings/fittingRoutes';
import { resolveFittingShareView } from '@/features/fittings/resolveFittingShareView';
import { FittingModuleList } from '@/features/fittings/FittingModuleList';
import { FittingRing } from '@/features/fittings/FittingRing';
import { FittingStatsSections } from '@/features/fittings/FittingStatsSections';
import { useTargetProfiles } from '@/features/fittings/targetProfiles';
import { useFittingHardpoints } from '@/features/fittings/useFittingHardpoints';
import { useFittingEvaluation } from '@/features/fittings/useFittingEvaluation';
import { fittingToEft } from '@/engine/fittings/eftExport';
import { useMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { loadTypes } from '@/sde/loadSde';

type LoadState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'unsupported-version' }
  | { status: 'failed' }
  | { status: 'ready'; fitting: Fitting; profile: PilotProfile };

const COPIED_MS = 2000;

/** `typeId -> name`, `null` until `loadTypes` resolves — shared by the module list and Copy EFT, so both read one lookup rather than each loading its own. */
type TypeName = (typeId: number) => string;

/**
 * The read-only view a Fitting Share Code (#1544) opens with no session:
 * every skill at level V, stated in a banner, the Fitting's own implant set
 * if it carries one (`resolveFittingShareView`). Outside `RequireCharacter`
 * and `ScopeGate` deliberately, the same exemption `/s/:shareId` has
 * (`routeScopes.test.ts` asserts it) — this is the second unauthenticated
 * content route, not the first.
 *
 * A visitor who already has a Character never sees this: the same `?f=` opens
 * straight into the editor instead, per GLOSSARY.md's **Fitting Share Code**.
 */
export function FittingShared() {
  const [searchParams] = useSearchParams();
  return <FittingShareView code={searchParams.get('f') ?? ''} />;
}

/**
 * One Fitting Share Code, read-only at every skill V — what both the
 * permanent `/share/fitting?f=` URL and a Fitting's short **Share Link**
 * (`routes/SharedLink.tsx`) open. A visitor with a Character is redirected
 * into the editor on the code instead.
 */
export function FittingShareView({
  code,
  expiresAt,
}: {
  code: string;
  /** Epoch millis a Share Link dies at; absent for the permanent URL, which never does. */
  expiresAt?: number;
}) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const characterCount = useCharacterCountOrLoading();

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // Bumped by Retry, and by the connection returning, to resolve the code again.
  const [attempt, setAttempt] = useState(0);
  const online = useOnline();
  const [typeName, setTypeName] = useState<TypeName | null>(null);
  // The hull's inventory group, for the Abyssal section's hull rule; undefined until the types load.
  const [shipGroupId, setShipGroupId] = useState<number | undefined>(undefined);
  // Names a mutated item's rolls in the EFT copy.
  const mutaplasmids = useMutaplasmidLookup();
  const [copied, setCopied] = useState(false);
  // Bumped per attempt so a repeat copy is announced again.
  const [copyCount, setCopyCount] = useState(0);
  const targetProfiles = useTargetProfiles();
  const [copyFailed, setCopyFailed] = useState(false);

  // A different code means the old names belong to a different Fitting.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new code, not a render-time derivation
    setTypeName(null);
    setShipGroupId(undefined);
  }, [code]);

  useEffect(() => {
    // Still resolving `characterCount`, or this visitor is about to be
    // redirected into the editor instead (see the render below) — either
    // way, decoding and computing stats for a view that won't be shown is
    // wasted work.
    if (characterCount !== 0) return;
    if (code === '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a missing code needs no async work, not a render-time derivation
      setState({ status: 'invalid' });
      return;
    }
    let cancelled = false;
    void (async () => {
      setState({ status: 'loading' });
      try {
        const result = await resolveFittingShareView(code);
        if (cancelled) return;
        setState(
          result.ok
            ? { status: 'ready', fitting: result.fitting, profile: result.profile }
            : { status: result.reason }
        );
      } catch {
        if (!cancelled) setState({ status: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, characterCount, attempt]);

  const failed = state.status === 'failed';
  const [focusRef, , holdFocus] = useRetryFocus<HTMLDivElement>(failed ? 'failed' : 'busy', code);
  useEffect(() => (failed ? onReconnect(() => setAttempt((n) => n + 1)) : undefined), [failed]);

  const readyFitting = state.status === 'ready' ? state.fitting : null;
  const readyProfile = state.status === 'ready' ? state.profile : null;

  // On the Fitting's own set, under the viewer's own Damage Profile (a
  // local-then-synced setting, so it works with no session too) — the link
  // itself never carries one. A new code clears the stats while it resolves.
  const {
    stats,
    statsProgress,
    statsError,
    retry,
    price,
    damageProfiles,
    compareWeather,
    statsWeatherTypeId,
  } = useFittingEvaluation({
    fitting: readyFitting,
    profile: readyProfile,
    implantBasis: 'fitting',
  });
  const hardpoints = useFittingHardpoints(readyFitting);

  useEffect(() => {
    if (readyFitting === null) return;
    let cancelled = false;
    void (async () => {
      const types = await loadTypes();
      if (!cancelled) {
        setShipGroupId(types[String(readyFitting.shipTypeId)]?.groupID);
        setTypeName(() => (typeId: number) => typeNameOr(t, types[String(typeId)]?.name, typeId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readyFitting, t]);

  // Same frame as the ready page, so a stored link does not swap frames while the count loads.
  if (characterCount === undefined) {
    return (
      <ShareShell title={t('fittingShare.title')} layout="wide">
        <div className="flex justify-center py-10">
          <Spinner label={t('common.loading')} />
        </div>
      </ShareShell>
    );
  }
  // A visitor with a Character never gets the All-V view — the same link
  // opens in the editor, under their own pilot (GLOSSARY.md **Fitting Share Code**).
  if (characterCount > 0) {
    return <Navigate to={fittingEditLocation(code)} replace />;
  }

  const editLocation = fittingEditLocation(code);
  const openInApp = { path: `${editLocation.pathname}${editLocation.search}` };

  async function copyEft() {
    if (state.status !== 'ready' || typeName === null) return;
    setCopyCount((count) => count + 1);
    try {
      await writeToClipboard(
        fittingToEft(state.fitting, typeName, { attributeName: mutaplasmids?.attributeName })
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), COPIED_MS);
    }
  }

  return (
    <ShareShell
      title={t('fittingShare.title')}
      openInApp={openInApp}
      layout="wide"
      notice={t('fittingShare.banner')}
      lead={
        state.status === 'ready' ? (
          <div className="flex items-center gap-3">
            <TypeIcon typeId={state.fitting.shipTypeId} size={64} className="size-12 shrink-0" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">
                {typeName?.(state.fitting.shipTypeId) ?? ''}
              </h2>
              {typeName !== null &&
                state.fitting.name !== '' &&
                state.fitting.name !== typeName(state.fitting.shipTypeId) && (
                  <p className="truncate text-sm text-text-dim">{state.fitting.name}</p>
                )}
            </div>
          </div>
        ) : undefined
      }
      footer={
        expiresAt === undefined ? undefined : (
          <StatChips>
            <StatChip
              label={t('fittingShare.expiresLabel')}
              value={formatDateOnly(new Date(expiresAt), timeZone)}
            />
          </StatChips>
        )
      }
      actions={
        state.status === 'ready' ? (
          <>
            {/* Absolutely positioned, so it adds no flex gap. */}
            <LiveStatus announceKey={copyCount}>
              {copied ? t('fittingShare.copied') : copyFailed ? t('fittingShare.copyFailed') : null}
            </LiveStatus>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void copyEft()}
              disabled={typeName === null}
            >
              {copied
                ? t('fittingShare.copied')
                : copyFailed
                  ? t('fittingShare.copyFailed')
                  : t('fittingShare.copyEft')}
            </Button>
          </>
        ) : undefined
      }
    >
      {/* Always mounted: Retry unmounts while the code resolves again, and focus waits here. */}
      <div ref={focusRef} tabIndex={-1} className="focus:outline-none">
        {state.status === 'loading' && (
          <div className="flex justify-center py-10">
            <Spinner label={t('common.loading')} />
          </div>
        )}

        {state.status === 'failed' && (
          <EmptyState
            title={t('fittingShare.loadFailedTitle')}
            hint={t(online ? 'fittingShare.loadFailedHint' : 'fittingShare.loadFailedOffline')}
            action={
              <Button
                onClick={() => {
                  holdFocus();
                  setAttempt((n) => n + 1);
                }}
              >
                {t('common.retry')}
              </Button>
            }
            className="py-10"
          />
        )}
      </div>

      {(state.status === 'invalid' || state.status === 'unsupported-version') && (
        <EmptyState
          title={t('fittingShare.invalidTitle')}
          hint={t('fittingShare.invalidHint')}
          className="py-10"
        />
      )}

      {state.status === 'ready' && (
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-col gap-4 lg:w-[30rem] lg:shrink-0">
              <FittingRing
                fitting={state.fitting}
                stats={stats}
                moduleResults={stats?.modules ?? null}
                hardpointsUsed={hardpoints.used}
                hardpointKindOf={hardpoints.kindOf}
                typeName={typeName ?? ((typeId) => `#${typeId}`)}
              />
              {typeName !== null && (
                <FittingModuleList
                  fitting={state.fitting}
                  typeName={typeName}
                  title={t('fittingShare.moduleListTitle')}
                />
              )}
            </div>
            <div className="min-w-0 lg:min-w-80 lg:flex-1">
              <FittingStatsSections
                abyssal={{ hullGroupId: shipGroupId, compare: compareWeather }}
                statsWeatherTypeId={statsWeatherTypeId}
                stats={stats}
                statsProgress={statsProgress}
                statsError={statsError}
                onRetry={retry}
                price={price}
                typeName={typeName ?? ((typeId) => `#${typeId}`)}
                damageProfiles={damageProfiles}
                targetProfiles={targetProfiles}
              />
            </div>
          </div>
        </>
      )}
    </ShareShell>
  );
}
