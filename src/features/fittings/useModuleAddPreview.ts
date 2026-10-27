/**
 * The whole-Fitting stat change of adding a hovered or focused module from
 * the Add panel, before it is fitted. The candidate is the open Fitting with
 * the module added exactly where a click would put it (`build`); every
 * number comes from the Fitting's `VariantEvaluator`, as the Variations
 * modal's do. Debounced, so a sweep down a list evaluates only the row the
 * pointer settles on, and cancelled on leave so no stale work lands.
 */
import { useEffect, useRef, useState } from 'react';
import {
  firstResourceOverage,
  fitsResourceBudget,
  type ResourceBudgetOverage,
} from '@/engine/fittings/skillGaps';
import type { Fitting } from '@/engine/fittings/types';
import { diffFittingStats, type FittingStatsDelta } from '@/engine/fittings/variationDelta';
import type { CandidateCheck } from './dogmaFittingEngine';
import type { VariantEvaluator } from './useFittingEvaluation';

/** How long the pointer must rest on a row before it is evaluated. */
export const ADD_PREVIEW_DELAY_MS = 150;

export interface AddPreview {
  typeId: number;
  delta: FittingStatsDelta;
  fits: boolean;
  /** Set only when the module is over a CPU/PG/calibration budget; null otherwise. */
  overage: ResourceBudgetOverage | null;
  canFly: boolean;
}

interface UseModuleAddPreviewParams {
  variants: VariantEvaluator | null;
  /** The hovered or focused module; null when none (or previews are off). */
  typeId: number | null;
  /** The Fitting with `typeId` added where a click would put it; null when a click adds nothing. */
  build: (fitting: Fitting, typeId: number) => Fitting | null;
  /** Hull / skill verdict for a type, from the panel's shared hull check. */
  checkFor: (typeId: number) => CandidateCheck | null;
}

export function useModuleAddPreview({
  variants,
  typeId,
  build,
  checkFor,
}: UseModuleAddPreviewParams): AddPreview | null {
  const [computed, setComputed] = useState<{
    variants: VariantEvaluator;
    preview: AddPreview;
  } | null>(null);
  // Read through refs so a fresh closure every render doesn't restart the debounce.
  const buildRef = useRef(build);
  const checkRef = useRef(checkFor);
  useEffect(() => {
    buildRef.current = build;
    checkRef.current = checkFor;
  });

  useEffect(() => {
    if (!variants || typeId === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const candidate = buildRef.current(variants.fitting, typeId);
          if (!candidate) return;
          const { before, after } = await variants.compare(candidate);
          if (cancelled) return;
          const check = checkRef.current(typeId);
          setComputed({
            variants,
            preview: {
              typeId,
              delta: diffFittingStats(before, after),
              fits: fitsResourceBudget(after) && (check?.fitsHull ?? true),
              overage: firstResourceOverage(after),
              canFly: check?.canFly ?? true,
            },
          });
        } catch {
          // A calculation that throws just shows no preview for this row.
        }
      })();
    }, ADD_PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [variants, typeId]);

  return typeId !== null && computed?.variants === variants && computed.preview.typeId === typeId
    ? computed.preview
    : null;
}
