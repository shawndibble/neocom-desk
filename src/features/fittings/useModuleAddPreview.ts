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

export const ADD_PREVIEW_DELAY_MS = 150;

export interface AddPreview {
  typeId: number;
  delta: FittingStatsDelta;
  fits: boolean;
  overage: ResourceBudgetOverage | null;
  canFly: boolean;
}

interface UseModuleAddPreviewParams {
  variants: VariantEvaluator | null;
  typeId: number | null;
  build: (fitting: Fitting, typeId: number) => Fitting | null;
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
        } catch {}
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
