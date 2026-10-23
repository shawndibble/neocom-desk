/**
 * The Corp Board's widget kinds: the feeds each reads and its builder.
 * Same contract as `models.ts` (pure, derived at render time); joins its
 * `KINDS` table through `registerKindDefs` when the Corp route loads.
 * Structures and Moon extractions are the Overview's own kinds, reused as they are.
 */
import type { KindDef } from './builderKit';
import { corpAssets } from './corpAssetsModels';
import { corpContracts } from './corpContractsModels';
import { corpOrders } from './corpOrdersModels';
import { corpDeadlines, corpJobs, corpServices } from './corpClockModels';
import { corpSovereignty } from './corpSovereigntyModels';
import { corpStarbases } from './corpStarbaseModels';
import { corpCustomsOffices } from './corpCustomsModels';
import { corpRoleAudit } from './corpRoleAuditModels';
import { corpCashFlow, corpIncome, corpWallet } from './corpMoneyModels';
import { corpKills } from './corpOpsModels';
import { corpSrp } from './corpSrpModels';
import { corpInactive, corpMembers, corpMining } from './corpPeopleModels';

export const CORP_DEFS: Readonly<Record<string, KindDef>> = {
  corpDeadlines: {
    feeds: ['structures', 'moonChunks', 'corpJobs', 'corpStarbases', 'corpSovereignty'],
    build: corpDeadlines,
  },
  corpServices: { feeds: ['structures'], build: corpServices },
  corpStarbases: { feeds: ['corpStarbases'], build: corpStarbases },
  corpSovereignty: { feeds: ['corpSovereignty'], build: corpSovereignty },
  corpJobs: { feeds: ['corpJobs'], build: corpJobs },
  corpCustomsOffices: { feeds: ['corpCustoms'], build: corpCustomsOffices },
  corpRoleAudit: { feeds: ['corpRoleAudit'], build: corpRoleAudit },
  corpWallet: { feeds: ['corpWallet'], build: corpWallet },
  corpCashFlow: { feeds: ['corpWallet'], build: corpCashFlow },
  corpIncome: { feeds: ['corpWallet'], build: corpIncome },
  corpMembers: { feeds: ['corpMembers'], build: corpMembers },
  corpInactive: { feeds: ['corpMembers'], build: corpInactive },
  corpMining: { feeds: ['corpMining'], build: corpMining },
  corpOrders: { feeds: ['corpOrders'], build: corpOrders },
  corpContracts: { feeds: ['corpContracts'], build: corpContracts },
  corpAssets: { feeds: ['corpAssets', 'corpStockTargets'], build: corpAssets },
  corpKills: { feeds: ['corpKills'], build: corpKills },
  corpSrp: { feeds: ['corpSrp'], build: corpSrp },
};
