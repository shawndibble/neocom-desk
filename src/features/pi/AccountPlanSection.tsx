import { useMemo } from 'react';
import type { PiData } from '@/sde/types';
import { AccountPlanPanel } from './AccountPlanPanel';
import { accountView } from './accountPlanModel';
import { usePiSettings } from './piSettings';
import type { PlanAdvice } from './planAdviceModel';
import { useAccountPlan } from './useAccountPlan';

/**
 * Plans the whole account and draws it. Its own component so the planning runs
 * only while the section is on screen: a pilot with no colonies, or on another
 * Find best view, never pays for it.
 */
export function AccountPlanSection({ advice, pi }: { advice: PlanAdvice; pi: PiData }) {
  const settings = usePiSettings((state) => state.value);
  const haul = settings.haulBetweenPlanets === true;
  const account = useAccountPlan(advice, pi, { haul, buyTiers: settings.buyTiers });
  const view = useMemo(() => (account.plan ? accountView(account.plan) : null), [account.plan]);
  return (
    <AccountPlanPanel
      view={view}
      pending={account.pending}
      failed={account.failed}
      advice={advice}
      pi={pi}
      haul={haul}
      buying={settings.buyTiers.length > 0}
    />
  );
}
