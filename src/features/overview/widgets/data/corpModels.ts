/**
 * The Corp Board's widget kinds: the feeds each reads and its builder.
 * Same contract as `models.ts` (pure, derived at render time); joins the
 * registry (`models.ts`) through `registerKindDefs` when the Corp route loads.
 * Structures and Moon extractions are the Overview's own kinds, reused as they are.
 */
import { byShow, type KindDef } from './builderKit';
import { corpAssets } from './corpAssetsModels';
import { corpContracts } from './corpContractsModels';
import { corpOrders } from './corpOrdersModels';
import { corpDeadlines, corpJobs } from './corpClockModels';
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
    scope: 'character',
    build: corpDeadlines,
  },
  corpStarbases: { feeds: ['corpStarbases'], scope: 'character', build: corpStarbases },
  corpSovereignty: { feeds: ['corpSovereignty'], scope: 'character', build: corpSovereignty },
  corpJobs: { feeds: ['corpJobs'], scope: 'character', build: corpJobs },
  corpCustomsOffices: { feeds: ['corpCustoms'], scope: 'character', build: corpCustomsOffices },
  corpRoleAudit: { feeds: ['corpRoleAudit'], scope: 'character', build: corpRoleAudit },
  corpWallet: {
    feeds: ['corpWallet'],
    scope: 'character',
    build: byShow({ divisions: corpWallet, flow: corpCashFlow, sources: corpIncome }, corpWallet),
  },
  corpMembers: { feeds: ['corpMembers'], scope: 'character', build: corpMembers },
  corpInactive: { feeds: ['corpMembers'], scope: 'character', build: corpInactive },
  corpMining: { feeds: ['corpMining'], scope: 'character', build: corpMining },
  corpOrders: { feeds: ['corpOrders'], scope: 'character', build: corpOrders },
  corpContracts: { feeds: ['corpContracts'], scope: 'character', build: corpContracts },
  corpAssets: { feeds: ['corpAssets', 'corpStockTargets'], scope: 'character', build: corpAssets },
  corpKills: { feeds: ['corpKills'], scope: 'character', build: corpKills },
  corpSrp: { feeds: ['corpSrp'], scope: 'character', build: corpSrp },
};
