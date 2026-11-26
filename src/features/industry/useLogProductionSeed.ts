import { useEffect, useRef, useState } from 'react';
import type { IndustryBlueprint } from '@/engine/industry/types';
import type { JobProductionSeed } from './logProductionFromJob';

export function useLogProductionSeed(
  blueprint: IndustryBlueprint | null,
  pendingLogProduction: JobProductionSeed | null | undefined,
  pendingLogProductionKey: string | undefined
) {
  const [logRequest, setLogRequest] = useState(0);
  const [jobLogSeed, setJobLogSeed] = useState<{
    request: number;
    quantity: number;
    jobFee: number;
    jobId?: number;
  } | null>(null);
  const appliedLogProductionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingLogProduction || !blueprint) return;
    if (appliedLogProductionKeyRef.current === pendingLogProductionKey) return;
    appliedLogProductionKeyRef.current = pendingLogProductionKey ?? null;
    const quantity = blueprint.products[0]
      ? blueprint.products[0].quantity * pendingLogProduction.runs
      : 0;
    const nextRequest = logRequest + 1;
    setJobLogSeed({
      request: nextRequest,
      quantity,
      jobFee: pendingLogProduction.jobFee,
      jobId: pendingLogProduction.jobId,
    });
    setLogRequest(nextRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `logRequest` deliberately omitted: reapplying is gated on `pendingLogProductionKey` changing, not on `logRequest` itself, which this effect also writes
  }, [pendingLogProduction, pendingLogProductionKey, blueprint]);
  return { logRequest, setLogRequest, jobLogSeed };
}
