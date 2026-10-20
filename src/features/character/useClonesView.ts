import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { JumpClone } from '@/esi/endpoints';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { cloneJumpCooldown } from '@/engine/clone/cloneJump';
import { sumImplantValue } from '@/engine/implantValue';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import type { PriceMap } from '@/features/character/CloneCard';
import { cloneOwnName, useCloneNicknames } from '@/features/character/cloneNicknames';
import type { Snapshot } from '@/features/character/clonesSnapshot';
import { sortClones, useClonesSort } from '@/features/character/clonesSort';
import type { CloneVerdictCardState } from '@/features/character/CloneVerdictCard';
import {
  CLONE_NOTE_KEY,
  cloneVerdictGate,
  runCloneVerdict,
} from '@/features/character/cloneVerdictGate';

interface Inputs {
  data: Snapshot | null | undefined;
  activeCharacterId: number | null;
  loadedAt: number;
  cooldown: ReturnType<typeof cloneJumpCooldown>;
  clones: readonly JumpClone[];
  locationNames: ReadonlyMap<number, string>;
  jumpsByLocation: ReadonlyMap<number, JumpsAwayResult> | undefined;
  prices: PriceMap | undefined;
}

/**
 * Clones route view state: sort, nicknames, the best-clone verdict (the
 * engine does the numbers) and the sorted clone list. The route keeps the
 * snapshot load and the layout; this holds everything derived from them.
 */
export function useClonesView({
  data,
  activeCharacterId,
  loadedAt,
  cooldown,
  clones,
  locationNames,
  jumpsByLocation,
  prices,
}: Inputs) {
  const { t } = useTranslation();
  const sort = useClonesSort((state) => state.value);
  const setSort = useClonesSort((state) => state.setValue);
  useHydratedStore(useClonesSort);
  const nicknames = useCloneNicknames((state) => state.value);
  const nicknamesHydrated = useHydratedStore(useCloneNicknames);
  const cloneStates = useCloneStates((state) => state.value);
  const cloneStatesHydrated = useHydratedStore(useCloneStates);
  const training = data?.training ?? null;
  const readyAt = cooldown.onCooldown ? cooldown.readyAt : null;
  const verdictResult = useMemo(() => {
    if (!cloneStatesHydrated || activeCharacterId === null) return null;
    return runCloneVerdict(
      training,
      cloneStateFor(cloneStates, activeCharacterId),
      loadedAt,
      readyAt
    );
  }, [training, cloneStates, cloneStatesHydrated, activeCharacterId, loadedAt, readyAt]);

  const locationLabel = (clone: JumpClone) =>
    locationNames.get(clone.location_id) ??
    t(clone.location_type === 'station' ? 'clones.stationLabel' : 'clones.structureLabel', {
      id: clone.location_id,
    });
  const cloneLabel = (clone: JumpClone) => cloneOwnName(clone, nicknames) ?? locationLabel(clone);

  const verdictCard: CloneVerdictCardState | null = (() => {
    if (!data) return null;
    const note = (message: string): CloneVerdictCardState => ({ kind: 'note', message });
    const gate = cloneVerdictGate(
      {
        wornImplantsRead: data.wornImplants !== null,
        queue: data.queueResult?.data ?? null,
        training,
      },
      verdictResult
    );
    if (gate === null) return null;
    if (gate.kind === 'note') {
      return note(t(`clones.verdict.note${CLONE_NOTE_KEY[gate.note]}`));
    }
    const { verdict } = gate.result;
    if (verdict.kind === 'stay') {
      const rival = clones.find((c) => c.jump_clone_id === verdict.closest?.cloneId);
      return {
        kind: 'stay',
        stay: verdict.stay,
        cooldownReadyAt: readyAt,
        closest:
          verdict.closest && rival
            ? { label: cloneLabel(rival), extraSeconds: verdict.closest.extraSeconds }
            : null,
      };
    }
    const target = clones.find((c) => c.jump_clone_id === verdict.cloneId);
    if (!target) return null;
    const route = jumpsByLocation?.get(target.location_id);
    if (!route) return note(t('clones.verdict.noteRouting'));
    if (route.kind === 'unknown') return note(t('clones.verdict.noteRoute'));
    return {
      kind: 'jump',
      label: cloneLabel(target),
      savedSeconds: verdict.savedSeconds,
      attributes: verdict.attributes,
      stay: verdict.stay,
      best: verdict.best,
      cooldownReadyAt: verdict.cooldownReadyAt,
      route: {
        locationId: target.location_id,
        placeName: locationLabel(target),
        jumps: route.jumps,
      },
    };
  })();
  const showTraining = verdictCard !== null && verdictCard.kind !== 'note';
  const rowOf = (id: string | number) => verdictResult?.rows.find((r) => r.cloneId === id);
  const sortedClones = sortClones(
    clones.map((clone) => {
      const implantValue = prices ? sumImplantValue(clone.implants, prices) : null;
      return {
        clone,
        id: clone.jump_clone_id,
        locationId: clone.location_id,
        deltaSeconds: showTraining ? (rowOf(clone.jump_clone_id)?.deltaSeconds ?? null) : null,
        value:
          implantValue &&
          (implantValue.unpriced < clone.implants.length || clone.implants.length === 0)
            ? implantValue.total
            : null,
      };
    }),
    sort,
    jumpsByLocation
  ).map((x) => x.clone);
  const bestCloneId = showTraining ? (verdictResult?.bestCloneId ?? null) : null;

  return {
    sort,
    setSort,
    nicknames,
    nicknamesHydrated,
    training,
    verdictCard,
    showTraining,
    rowOf,
    sortedClones,
    bestCloneId,
    locationLabel,
  };
}
