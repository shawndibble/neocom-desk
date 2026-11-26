import type { Interaction } from '@/engine/interactions/interactions';
import type { Translate } from '@/lib/translate';

export interface PersonalQuery {
  otherId: number;
  otherName: string;
  characterIds: readonly number[];
  t: Translate;
}

export interface CorpQuery {
  otherId: number;
  otherName: string;
  corporationId: number;
  characterIds: readonly number[];
  t: Translate;
}

export type PersonalSource = (query: PersonalQuery) => Promise<Interaction[]>;
export type CorpSource = (query: CorpQuery) => Promise<Interaction[]>;
