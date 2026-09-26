import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { BootScreen } from '@/app/BootScreen';
import { buttonClassName, EmptyState, LogoMark, Panel, Spinner, TypeIcon } from '@/components/ui';
import { setLoginReturnTo } from '@/auth/loginReturnTo';
import { writeToClipboard } from '@/lib/clipboard';
import { fittingEditLocation } from '@/features/fittings/fittingRoutes';
import { resolveFittingShareView } from '@/features/fittings/resolveFittingShareView';
import { FittingRing } from '@/features/fittings/FittingRing';
import { FittingStatsSections } from '@/features/fittings/FittingStatsSections';
import { useTargetProfiles } from '@/features/fittings/targetProfiles';
import { useFittingHardpoints } from '@/features/fittings/useFittingHardpoints';
import { AbyssalWeatherPicker } from '@/features/fittings/AbyssalWeatherPicker';
import { useFittingEvaluation } from '@/features/fittings/useFittingEvaluation';
import { fittingToEft } from '@/engine/fittings/eftExport';
import { FITTING_SLOT_KINDS } from '@/engine/fittings/types';
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
 * The read-only view a Fitting's Share Link (#1544) opens with no session:
 * every skill at level V, stated in a banner, the Fitting's own implant set
 * if it carries one (`resolveFittingShareView`). Outside `RequireCharacter`
 * and `ScopeGate` deliberately, the same exemption `/share/appraisal` has
 * (`routeScopes.test.ts` asserts it) — this is the second unauthenticated
 * content route, not the first.
 *
 * A visitor who already has a Character never sees this: the same `?f=` opens
 * straight into the editor instead, per CONTEXT.md's **Share Link** entry.
 */
export function FittingShared() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('f') ?? '';
  const characterCount = useLiveQuery(() => db.characters.count());

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [typeName, setTypeName] = useState<TypeName | null>(null);
  const [copied, setCopied] = useState(false);
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
  const hardpointsUsed = useFittingHardpoints(readyFitting);

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

  if (characterCount === undefined) return <BootScreen />;
  // A visitor with a Character never gets the All-V view — the same link
  // opens in the editor, under their own pilot (CONTEXT.md **Share Link**).
  if (characterCount > 0) {
    return <Navigate to={fittingEditLocation(code)} replace />;
  }

  const editLocation = fittingEditLocation(code);
  const returnPath = `${editLocation.pathname}${editLocation.search}`;

  async function copyEft() {
    if (state.status !== 'ready' || typeName === null) return;
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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-bg p-6 text-text">
      <div className="flex items-center gap-2">
        <LogoMark className="size-6" />
        <h1 className="text-sm font-semibold tracking-widest uppercase">
          {t('fittingShare.title')}
        </h1>
      </div>

      <p className="rounded-xs border border-warning bg-panel-2 px-3 py-2 text-xs text-warning">
        {t('fittingShare.banner')}
      </p>

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
            hardpointsUsed={hardpointsUsed}
          />
          <FittingStatsSections
            conditions={<AbyssalWeatherPicker />}
            stats={stats}
            statsProgress={statsProgress}
            statsError={statsError}
            onRetry={retry}
            price={price}
            typeName={typeName ?? ((typeId) => `#${typeId}`)}
            damageProfiles={damageProfiles}
            targetProfiles={targetProfiles}
          />
          <ModuleList fitting={state.fitting} typeName={typeName} />
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          to="/login"
          onClick={() => setLoginReturnTo(returnPath)}
          className={buttonClassName({ size: 'sm', variant: 'primary' })}
        >
          {t('fittingShare.openInApp')}
        </Link>
        {state.status === 'ready' && (
          <button
            type="button"
            onClick={() => void copyEft()}
            disabled={typeName === null}
            className={buttonClassName({ size: 'sm' })}
          >
            {copied
              ? t('fittingShare.copied')
              : copyFailed
                ? t('fittingShare.copyFailed')
                : t('fittingShare.copyEft')}
          </button>
        )}
      </div>
    </main>
  );
}

/** Plain-text module/drone list — nothing editable, doubling as an accessible reading of the same data `FittingRing`'s icons show. */
function ModuleList({ fitting, typeName }: { fitting: Fitting; typeName: TypeName | null }) {
  const { t } = useTranslation();
  if (typeName === null) return null;

  const groups = FITTING_SLOT_KINDS.map((rack) => ({
    rack,
    modules: fitting.modules.filter((module) => module.slot === rack),
  })).filter((group) => group.modules.length > 0);

  if (groups.length === 0 && fitting.drones.length === 0 && fitting.cargo.length === 0) {
    return null;
  }

  return (
    <Panel title={t('fittingShare.moduleListTitle')}>
      <div className="space-y-3 text-xs">
        {groups.map(({ rack, modules }) => (
          <div key={rack}>
            <p className="font-semibold tracking-widest text-text-dim uppercase">
              {t(`fittings.list.rack.${rack}`)}
            </p>
            <ul>
              {modules.map((module, index) => (
                <li key={index}>
                  {typeName(module.typeId)}
                  {module.chargeTypeId !== undefined && ` — ${typeName(module.chargeTypeId)}`}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {fitting.drones.length > 0 && (
          <div>
            <p className="font-semibold tracking-widest text-text-dim uppercase">
              {t('fittings.list.drones')}
            </p>
            <ul>
              {fitting.drones.map((drone, index) => (
                <li key={index}>
                  {typeName(drone.typeId)} x{drone.quantity}
                </li>
              ))}
            </ul>
          </div>
        )}
        {fitting.cargo.length > 0 && (
          <div>
            <p className="font-semibold tracking-widest text-text-dim uppercase">
              {t('fittings.list.cargo')}
            </p>
            <ul>
              {fitting.cargo.map((item, index) => (
                <li key={index}>
                  {typeName(item.typeId)} x{item.quantity}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
