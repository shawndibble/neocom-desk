import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { newestFirst, type Interaction } from '@/engine/interactions/interactions';
import type { Translate } from '@/lib/translate';
import type { CorpSource, PersonalSource } from './sourceTypes';

export type InteractionScope = 'current' | 'all' | 'corporation';

export interface InteractionsInput {
  scope: InteractionScope;
  otherId: number;
  otherName: string;
  characterIds: readonly number[];
  corporationId: number | null;
  t: Translate;
}

export interface InteractionsResult {
  rows: Interaction[];
  incomplete: boolean;
}

const personalSources = (): Promise<PersonalSource[]> =>
  Promise.all([
    import('./walletSource').then((m) => m.walletSource),
    import('./contractSource').then((m) => m.contractSource),
    import('./mailSource').then((m) => m.mailSource),
    import('./killSource').then((m) => m.killSource),
  ]);

const corpSourceList = (): Promise<readonly CorpSource[]> =>
  import('./corpSources').then((m) => m.corpSources);

export async function loadInteractions(input: InteractionsInput): Promise<InteractionsResult> {
  const { scope, otherId, otherName, characterIds, corporationId, t } = input;
  const runs: Promise<Interaction[]>[] =
    scope === 'corporation'
      ? corporationId === null
        ? []
        : (await corpSourceList()).map((source) =>
            source({ otherId, otherName, corporationId, characterIds, t })
          )
      : (await personalSources()).map((source) => source({ otherId, otherName, characterIds, t }));
  const settled = await Promise.allSettled(runs);
  const rows = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return {
    rows: newestFirst(rows),
    incomplete: settled.some((r) => r.status === 'rejected'),
  };
}

export function useInteractions(input: InteractionsInput | null) {
  const key =
    input === null
      ? null
      : `${input.scope}:${input.otherId}:${input.otherName}:${input.characterIds.join(',')}:${input.corporationId}`;
  const loader = useCallback(() => loadInteractions(input!), [input]);
  return useKeyedLoad(key, loader);
}
