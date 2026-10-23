/**
 * `/corp/srp` (issues #4851, #4852, epic #4608, ADR 0026): one role-aware page. No Corp Access
 * gate: a member of an SRP corporation files with no corp scope. Officer views (Settings, later
 * the queue) are listed by `features/corp/srp/srpViews.ts` for a pilot with `canManageSrp` and
 * check the server's verdict themselves.
 */
import { SrpPage } from '@/features/corp/srp/SrpPage';
import { useSrpNavVisible } from '@/features/corp/srp/useSrpNavVisible';
import { useCorpAccess } from '@/features/corp/useCorpAccess';

export function CorpSrp() {
  const { state, capabilities } = useCorpAccess();
  const srpOn = useSrpNavVisible();
  return <SrpPage canManageSrp={state === 'ready' && capabilities.canManageSrp} srpOn={srpOn} />;
}
