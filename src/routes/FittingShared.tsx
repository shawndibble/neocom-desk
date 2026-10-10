import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { BootScreen } from '@/app/BootScreen';
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
import { fittingEditLocation } from '@/features/fittings/fittingRoutes';
import { resolveFittingShareView } from '@/features/fittings/resolveFittingShareView';
import { FittingModuleList } from '@/features/fittings/FittingModuleList';
import { FittingRing } from '@/features/fittings/FittingRing';
import { FittingStatsSections } from '@/features/fittings/FittingStatsSections';
import { useTargetProfiles } from '@/features/fittings/targetProfiles';
import { useFittingHardpoints } from '@/features/fittings/useFittingHardpoints';
import { AbyssalWeatherPicker } from '@/features/fittings/AbyssalWeatherPicker';
import { StatFields } from '@/features/fittings/StatFacts';
import { useFittingEvaluation } from '@/features/fittings/useFittingEvaluation';
import { fittingToEft } from '@/engine/fittings/eftExport';
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
 * straight into the editor instead, per CONTEXT.md's **Fitting Share Code**.
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
  const characterCount = useLiveQuery(() => db.characters.count());

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [typeName, setTypeName] = useState<TypeName | null>(null);
  const [copied, setCopied] = useState(false);
  // Bumped per attempt so a repeat copy is announced again.
  const [copyCount, setCopyCount] = useState(0);
  const targetProfiles = useTargetProfiles();
  const [copyFailed, setCopyFailed] = useState(false);

  // A different code means the old names belong to a different Fitting.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new code, not a render-time derivation
    setTypeName(null);
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
  }, [code, characterCount]);

  const readyFitting = state.status === 'ready' ? state.fitting : null;
  const readyProfile = state.status === 'ready' ? state.profile : null;

  // On the Fitting's own set, under the viewer's own Damage Profile (a
  // local-then-synced setting, so it works with no session too) — the link
  // itself never carries one. A new code clears the stats while it resolves.
  const { stats, statsProgress, statsError, retry, price, damageProfiles } = useFittingEvaluation({
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
        setTypeName(
          () => (typeId: number) =>
            types[String(typeId)]?.name ?? t('common.unknownType', { id: typeId })
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readyFitting, t]);

  if (characterCount === undefined) return <BootScreen gate="fitting-shared" />;
  // A visitor with a Character never gets the All-V view — the same link
  // opens in the editor, under their own pilot (CONTEXT.md **Fitting Share Code**).
  if (characterCount > 0) {
    return <Navigate to={fittingEditLocation(code)} replace />;
  }

  const editLocation = fittingEditLocation(code);
  const openInApp = { path: `${editLocation.pathname}${editLocation.search}` };

  async function copyEft() {
    if (state.status !== 'ready' || typeName === null) return;
    setCopyCount((count) => count + 1);
    try {
      await writeToClipboard(fittingToEft(state.fitting, typeName));
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
      <p className="rounded-xs border border-warning bg-panel-2 px-3 py-2 text-xs text-warning">
        {t('fittingShare.banner')}
      </p>

      {expiresAt !== undefined && (
        <StatChips>
          <StatChip
            label={t('fittingShare.expiresLabel')}
            value={new Date(expiresAt).toLocaleString()}
          />
        </StatChips>
      )}

      {state.status === 'loading' && (
        <div className="flex justify-center py-10">
          <Spinner label={t('common.loading')} />
        </div>
      )}

      {(state.status === 'invalid' || state.status === 'unsupported-version') && (
        <EmptyState
          title={t('fittingShare.invalidTitle')}
          hint={t('fittingShare.invalidHint')}
          className="py-10"
        />
      )}

      {state.status === 'failed' && (
        <EmptyState
          title={t('fittingShare.loadFailedTitle')}
          hint={t('fittingShare.loadFailedHint')}
          className="py-10"
        />
      )}

      {state.status === 'ready' && (
        <>
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
          <FittingRing
            fitting={state.fitting}
            stats={stats}
            moduleResults={stats?.modules ?? null}
            hardpointsUsed={hardpoints.used}
            hardpointKindOf={hardpoints.kindOf}
          />
          <FittingStatsSections
            conditions={
              <StatFields>
                <AbyssalWeatherPicker field />
              </StatFields>
            }
            stats={stats}
            statsProgress={statsProgress}
            statsError={statsError}
            onRetry={retry}
            price={price}
            typeName={typeName ?? ((typeId) => `#${typeId}`)}
            damageProfiles={damageProfiles}
            targetProfiles={targetProfiles}
          />
          {typeName !== null && (
            <FittingModuleList
              fitting={state.fitting}
              typeName={typeName}
              title={t('fittingShare.moduleListTitle')}
            />
          )}
        </>
      )}
    </ShareShell>
  );
}
