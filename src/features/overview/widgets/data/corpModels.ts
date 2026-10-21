/**
 * The Corp overview's widget kinds: the feeds each reads and its builder.
 * Same contract as `models.ts` (pure, derived at render time); spread into its
 * `KINDS` table. Structures and Moon extractions are the Overview's own kinds,
 * reused as they are.
 */
import type { KindDef } from './builderKit';
import { corpContracts } from './corpContractsModels';
import { corpDeadlines, corpJobs, corpServices } from './corpClockModels';
import { corpCustomsOffices } from './corpCustomsModels';
import { corpCashFlow, corpIncome, corpWallet } from './corpMoneyModels';
import { corpKills } from './corpOpsModels';
import { corpInactive, corpMembers, corpMining } from './corpPeopleModels';

export const CORP_DEFS: Readonly<Record<string, KindDef>> = {
  corpDeadlines: { feeds: ['structures', 'moonChunks', 'corpJobs'], build: corpDeadlines },
  corpServices: { feeds: ['structures'], build: corpServices },
  corpJobs: { feeds: ['corpJobs'], build: corpJobs },
  corpCustomsOffices: { feeds: ['corpCustoms'], build: corpCustomsOffices },
  corpWallet: { feeds: ['corpWallet'], build: corpWallet },
  corpCashFlow: { feeds: ['corpWallet'], build: corpCashFlow },
  corpIncome: { feeds: ['corpWallet'], build: corpIncome },
  corpMembers: { feeds: ['corpMembers'], build: corpMembers },
  corpInactive: { feeds: ['corpMembers'], build: corpInactive },
  corpMining: { feeds: ['corpMining'], build: corpMining },
  corpContracts: { feeds: ['corpContracts'], build: corpContracts },
  corpKills: { feeds: ['corpKills'], build: corpKills },
};
