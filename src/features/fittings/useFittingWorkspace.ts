import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { renameFittingById, resolveSaveTarget, saveFitting } from './myFittings';
import { resolveCoalesce, resolveShareCodeChange } from './fittingShareSession';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useUrlParam } from '@/lib/useUrlState';
import { FITTING_EDIT_PATH, FITTINGS_PATH, fittingEditLocation } from './fittingRoutes';
import { nullableTextParam } from '@/lib/urlState';
import {
  decodeFittingShare,
  encodeFittingShare,
  type ShareDecodeError,
} from '@/engine/fittings/fittingShare';
import { withCheckedMutations } from '@/features/abyssal/mutaplasmidData';
import type { FittingXmlDocument } from '@/engine/import/eveFitXml';
import type { LoadedFitting, LoadOutcome } from '@/engine/fittings/load';
import { fittingToShareInput, shareToFitting } from '@/engine/fittings/shareMapper';
import { launchDrones, launchLimitsFrom } from '@/engine/fittings/fittingEdit';
import { loadFittingFromText } from './loadFittingFromText';
import { clearFittingDraft, readFittingDraft, writeFittingDraft } from './fittingDraft';
import { defaultImplantBasis, type ImplantBasis } from '@/engine/fittings/implantBasis';
import type {
  Fitting,
  FittingImplantSet,
  PilotProfile,
  StatsErrorReason,
} from '@/engine/fittings/types';
import { typeName } from '@/sde/loadSde';
import { resolveFittingXmlDocument, type FittingXmlListItem } from './fittingXmlList';
import { usePilotProfile } from './fittingPilotProfile';
import { useFittingEvaluation, type FittingEvaluation } from './useFittingEvaluation';

const COALESCE_MS = 1000;

export type FittingChange = (fitting: Fitting) => Fitting;

export interface FittingWorkspace extends FittingEvaluation {
  statsErrorReason: StatsErrorReason;
  skillsKnown: boolean;
  fitting: Fitting | null;
  shareError: ShareDecodeError | null;
  lastLoad: LoadOutcome | null;
  tooLargeToShare: boolean;
  loadFromInput: (text: string, options?: { replaceEntry?: boolean }) => Promise<void>;
  loadFittingXmlDocument: (document: FittingXmlDocument) => Promise<FittingXmlListItem[]>;
  openLoaded: (loaded: LoadedFitting) => Promise<void>;
  openFitting: (fitting: Fitting) => Promise<void>;
  edit: (change: FittingChange, coalesceKey?: string) => void;
  implantBasis: ImplantBasis;
  canUseCloneBasis: boolean;
  setImplantSet: (implantSet: FittingImplantSet | undefined) => void;
  profile: PilotProfile | null;
  savedId: string | null;
  canSave: boolean;
  save: () => Promise<boolean>;
  saveAsNew: (name: string) => Promise<void>;
  rename: (name: string) => void;
  openSaved: (record: { id: string; name: string; code: string }) => void;
}

export function useFittingWorkspace(): FittingWorkspace {
  const [shareCode] = useUrlParam('f', nullableTextParam());
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  useLayoutEffect(() => {
    locationRef.current = location;
  });
  const setShareCode = useCallback(
    (
      code: string,
      { push = false, replaceEntry = false }: { push?: boolean; replaceEntry?: boolean } = {}
    ) => {
      const now = locationRef.current;
      if (now.pathname === FITTING_EDIT_PATH && new URLSearchParams(now.search).get('f') === code)
        return;
      void navigate(fittingEditLocation(code), {
        replace: replaceEntry || (!push && now.pathname === FITTING_EDIT_PATH),
      });
    },
    [navigate]
  );
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const [fitting, setFitting] = useState<Fitting | null>(null);
  const [shareError, setShareError] = useState<ShareDecodeError | null>(null);
  const [lastLoad, setLastLoad] = useState<LoadOutcome | null>(null);
  const [tooLargeToShare, setTooLargeToShare] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const tooLargeRef = useRef(false);
  useLayoutEffect(() => {
    tooLargeRef.current = tooLargeToShare;
  });

  const ownWriteRef = useRef<{ code: string | null; fitting: Fitting | null } | null>(null);
  const savingRef = useRef(false);
  const pendingOpenRef = useRef<{ code: string; name: string } | null>(null);

  const latestFittingRef = useRef<Fitting | null>(null);
  const editSeqRef = useRef(0);
  const lastWriteRef = useRef<{ key: string; at: number } | null>(null);
  const launchPendingRef = useRef<
    { code: string } | { fitting: Fitting; writeUrl: boolean } | null
  >(null);
  const [launchRequest, setLaunchRequest] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const own = ownWriteRef.current;
    ownWriteRef.current = null;
    const pending = pendingOpenRef.current;
    pendingOpenRef.current = null;
    const { isDifferentFitting, resetSavedId, adopted } = resolveShareCodeChange({
      ownWrite: own,
      pendingOpen: pending,
      shareCode,
    });
    if (isDifferentFitting) {
      launchPendingRef.current = null;
      if (resetSavedId) setSavedId(null);
      setLastLoad(null);
      setTooLargeToShare(false);
      lastWriteRef.current = null;
    }
    if (shareCode !== null) void clearFittingDraft();
    if (shareCode === null && adopted !== null) {
      latestFittingRef.current = adopted;
      setShareError(null);
      setFitting(adopted);
      return;
    }
    if (shareCode === null) {
      latestFittingRef.current = null;

      setFitting(null);
      setShareError(null);
      void readFittingDraft().then((draft) => {
        if (cancelled || draft === null || latestFittingRef.current !== null) return;
        latestFittingRef.current = draft;
        setTooLargeToShare(true);
        setFitting(draft);
      });
      return () => {
        cancelled = true;
      };
    }
    if (adopted !== null) {
      latestFittingRef.current = adopted;
      setShareError(null);
      setFitting(adopted);
      return;
    }
    void (async () => {
      const decoded = await decodeFittingShare(shareCode);
      if (cancelled) return;
      if (!decoded.ok) {
        setShareError(decoded.reason);
        latestFittingRef.current = null;
        setFitting(null);
        return;
      }
      const pendingName = pending?.code === shareCode ? pending.name : undefined;
      const fallbackName = pendingName ?? (await typeName(decoded.value.hullTypeId));
      if (cancelled) return;
      const opened = await withCheckedMutations(
        shareToFitting(
          pendingName === undefined ? decoded.value : { ...decoded.value, name: pendingName },
          fallbackName
        )
      );
      if (cancelled) return;
      const launch = launchPendingRef.current;
      if (launch !== null && 'code' in launch && launch.code === shareCode) {
        launchPendingRef.current = { fitting: opened, writeUrl: true };
      }
      latestFittingRef.current = opened;
      setShareError(null);
      setFitting(opened);
    })();
    return () => {
      cancelled = true;
    };
  }, [shareCode]);

  const leaveShareCode = useCallback(
    (oversized: Fitting) => {
      if (new URLSearchParams(locationRef.current.search).get('f') === null) return;
      ownWriteRef.current = { code: null, fitting: oversized };
      void navigate(FITTINGS_PATH);
    },
    [navigate]
  );

  const commitFitting = useCallback(
    async (
      loaded: Fitting,
      {
        launchDrones: launch = false,
        replaceEntry = false,
      }: { launchDrones?: boolean; replaceEntry?: boolean } = {}
    ) => {
      const encoded = await encodeFittingShare(fittingToShareInput(loaded));
      setTooLargeToShare(!encoded.ok);
      const current = latestFittingRef.current;
      launchPendingRef.current = !launch
        ? null
        : !encoded.ok
          ? { fitting: loaded, writeUrl: false }
          : encoded.payload === shareCode && current !== null
            ? { fitting: current, writeUrl: true }
            : { code: encoded.payload };
      if (launch) setLaunchRequest((n) => n + 1);
      if (!encoded.ok) {
        void writeFittingDraft(loaded);
        leaveShareCode(loaded);
      } else void clearFittingDraft();
      if (encoded.ok) {
        if (encoded.payload !== shareCode)
          ownWriteRef.current = { code: encoded.payload, fitting: null };
        setShareCode(encoded.payload, { push: true, replaceEntry });
      } else {
        latestFittingRef.current = loaded;
        setShareError(null);
        setFitting(loaded);
      }
    },
    [shareCode, setShareCode, leaveShareCode]
  );

  const loadFromInput = useCallback(
    async (text: string, { replaceEntry = false }: { replaceEntry?: boolean } = {}) => {
      const outcome = await loadFittingFromText(text);
      if (outcome.kind === 'share') {
        setLastLoad(null);
        setShareCode(outcome.code, { push: true, replaceEntry });
        return;
      }
      setLastLoad(outcome);
      if (outcome.kind === 'failed') return;
      setSavedId(null);
      await commitFitting(outcome.fitting, { launchDrones: true, replaceEntry });
    },
    [commitFitting, setShareCode]
  );

  const openLoaded = useCallback(
    async (loaded: LoadedFitting) => {
      setLastLoad(loaded);
      setSavedId(null);
      await commitFitting(loaded.fitting, { launchDrones: true });
    },
    [commitFitting]
  );

  const openFitting = useCallback(
    async (opened: Fitting) => {
      setLastLoad(null);
      setSavedId(null);
      await commitFitting(opened);
    },
    [commitFitting]
  );

  const applyEdit = useCallback(
    (
      change: FittingChange,
      {
        coalesceKey,
        history = 'push',
      }: { coalesceKey?: string; history?: 'push' | 'replace' | 'none' } = {}
    ) => {
      const current = latestFittingRef.current;
      if (current === null) return;
      if (history === 'push') launchPendingRef.current = null;
      const next = change(current);
      latestFittingRef.current = next;
      setFitting(next);
      if (history === 'none') {
        if (tooLargeRef.current) void writeFittingDraft(next);
        return;
      }

      const seq = ++editSeqRef.current;
      void (async () => {
        const encoded = await encodeFittingShare(fittingToShareInput(next));
        if (seq !== editSeqRef.current) return;
        setTooLargeToShare(!encoded.ok);
        if (!encoded.ok) {
          void writeFittingDraft(next);
          leaveShareCode(next);
          return;
        }
        void clearFittingDraft();
        const { coalesce, next: nextRun } = resolveCoalesce(
          lastWriteRef.current,
          coalesceKey,
          Date.now(),
          COALESCE_MS
        );
        lastWriteRef.current = nextRun;
        ownWriteRef.current = { code: encoded.payload, fitting: next };
        setShareCode(encoded.payload, { push: !coalesce && history === 'push' });
      })();
    },
    [setShareCode, leaveShareCode]
  );
  const edit = useCallback(
    (change: FittingChange, coalesceKey?: string) => applyEdit(change, { coalesceKey }),
    [applyEdit]
  );

  const canSave = activeCharacterId !== null && fitting !== null && !tooLargeToShare;

  const save = useCallback(async () => {
    const current = latestFittingRef.current;
    if (activeCharacterId === null || current === null) return false;
    launchPendingRef.current = null;
    if (savingRef.current) return false;
    savingRef.current = true;
    try {
      const encoded = await encodeFittingShare(fittingToShareInput(current));
      if (!encoded.ok) return false;
      const target = await resolveSaveTarget(savedId, activeCharacterId, current.name);
      const record = await saveFitting(activeCharacterId, { ...target, code: encoded.payload });
      setSavedId(record.id);
      return true;
    } finally {
      savingRef.current = false;
    }
  }, [activeCharacterId, savedId]);

  const saveAsNew = useCallback(
    async (name: string) => {
      const current = latestFittingRef.current;
      if (activeCharacterId === null || current === null) return;
      launchPendingRef.current = null;
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        const encoded = await encodeFittingShare(fittingToShareInput(current));
        if (!encoded.ok) return;
        const record = await saveFitting(activeCharacterId, { name, code: encoded.payload });
        setSavedId(record.id);
        applyEdit((f) => ({ ...f, name }), { history: 'none' });
      } finally {
        savingRef.current = false;
      }
    },
    [activeCharacterId, applyEdit]
  );

  const rename = useCallback(
    (name: string) => {
      applyEdit((f) => ({ ...f, name }), { history: 'none' });
      if (savedId === null) return;
      void renameFittingById(savedId, name);
    },
    [applyEdit, savedId]
  );

  useEffect(() => {
    launchPendingRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new Character, not a render-time derivation
    setSavedId(null);
  }, [activeCharacterId]);

  const openSaved = useCallback(
    (record: { id: string; name: string; code: string }) => {
      pendingOpenRef.current = { code: record.code, name: record.name };
      editSeqRef.current++;
      void clearFittingDraft();
      setSavedId(record.id);
      setLastLoad(null);
      setTooLargeToShare(false);
      setShareCode(record.code, { push: true });
    },
    [setShareCode]
  );

  const canUseCloneBasis = activeCharacterId !== null;
  const implantBasis: ImplantBasis =
    fitting === null ? 'clone' : !canUseCloneBasis ? 'fitting' : defaultImplantBasis(fitting);

  const setImplantSet = useCallback(
    (implantSet: FittingImplantSet | undefined) => {
      edit((f) => ({ ...f, implantSet }), implantSet === undefined ? undefined : 'implant-set');
    },
    [edit]
  );

  const {
    profile,
    failed: profileFailed,
    skillsKnown,
    retry: retryProfile,
  } = usePilotProfile(activeCharacterId);
  const evaluation = useFittingEvaluation({ fitting, profile, implantBasis });

  const { currentStats } = evaluation;
  useEffect(() => {
    const pending = launchPendingRef.current;
    if (pending === null || fitting === null || currentStats === null) return;
    if (!('fitting' in pending) || pending.fitting !== fitting) return;
    launchPendingRef.current = null;
    const launched = launchDrones(fitting, launchLimitsFrom(currentStats));
    if (launched !== fitting) {
      applyEdit(() => launched, { history: pending.writeUrl ? 'replace' : 'none' });
    }
  }, [currentStats, fitting, applyEdit, launchRequest]);
  const retryEvaluation = evaluation.retry;
  const retry = useCallback(() => {
    if (profileFailed) retryProfile();
    else retryEvaluation();
  }, [profileFailed, retryProfile, retryEvaluation]);

  return {
    fitting,
    shareError,
    lastLoad,
    tooLargeToShare,
    loadFromInput,
    loadFittingXmlDocument: resolveFittingXmlDocument,
    openLoaded,
    openFitting,
    edit,
    implantBasis,
    canUseCloneBasis,
    setImplantSet,
    ...evaluation,
    statsError: evaluation.statsError || profileFailed,
    statsErrorReason: (profileFailed ? 'skills' : 'shipData') satisfies StatsErrorReason,
    skillsKnown,
    retry,
    profile,
    savedId,
    canSave,
    save,
    saveAsNew,
    rename,
    openSaved,
  };
}
