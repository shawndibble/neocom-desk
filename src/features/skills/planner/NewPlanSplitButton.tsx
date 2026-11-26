import { Suspense, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/db';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  useOpenAfterMenu,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { scheduleSync } from '@/sync';
import { isSyncConfigured } from '@/app/syncStatus';
import type { PlanEntry } from '@/engine/types';
import type { CertifiedPlan } from '@/sde/types';
import { newPlan } from './newPlan';
import { certifiedPlanRecord, type TrainedLevels } from './certifiedPlan';
import { CertifiedPlanDialog } from './CertifiedPlanDialog';
import type { RemapAvailability } from './remapAvailability';
import { lazyNamed } from '@/app/lazyNamed';

const CommunityPlansDialog = lazyNamed(
  () => import('@/features/communities/CommunityPlansDialog'),
  'CommunityPlansDialog'
);

export function NewPlanSplitButton({
  activeCharacterId,
  remapInfo,
  certified,
  onOptimizeQueue,
  queueEmpty = false,
}: {
  activeCharacterId: number;
  remapInfo: RemapAvailability | null;
  certified?: { open: boolean; onOpenChange: (open: boolean) => void };
  onOptimizeQueue?: () => void;
  queueEmpty?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const newPlanMenu = useOpenAfterMenu();
  const [certifiedOpenState, setCertifiedOpenState] = useState(false);
  const certifiedOpen = certified ? certified.open : certifiedOpenState;
  const setCertifiedOpen = certified ? certified.onOpenChange : setCertifiedOpenState;
  const [communityOpen, setCommunityOpen] = useState(
    () => new URLSearchParams(location.search).get('browse') === 'community'
  );
  const copyingFromCommunity = useRef(false);
  const queueEmptyId = useId();

  function syncAfterEdit() {
    if (isSyncConfigured()) scheduleSync(activeCharacterId, { collections: ['plans'] });
  }

  function closeCommunity() {
    setCommunityOpen(false);
    if (new URLSearchParams(location.search).has('browse')) {
      navigate({ pathname: location.pathname }, { replace: true });
    }
  }

  async function handleCreate() {
    const plan = newPlan(activeCharacterId, t('plans.newPlanName'), remapInfo?.available ?? 0);
    await db.skillPlans.add(plan);
    syncAfterEdit();
    navigate(`/skills/plans/${plan.id}`, { state: { focusName: true } });
  }

  async function handleCreateFromCertified(
    certified: CertifiedPlan,
    skillNameFor: (skillTypeID: number) => string,
    trained: TrainedLevels | null
  ) {
    const plan = certifiedPlanRecord(
      activeCharacterId,
      certified,
      skillNameFor,
      remapInfo?.available ?? 0,
      trained
    );
    await db.skillPlans.add(plan);
    syncAfterEdit();
    setCertifiedOpen(false);
    navigate(`/skills/plans/${plan.id}`);
  }

  async function handleCreateFromCommunity(shared: { name: string; entries: PlanEntry[] }) {
    if (copyingFromCommunity.current) return;
    copyingFromCommunity.current = true;
    try {
      const plan = {
        ...newPlan(activeCharacterId, shared.name, remapInfo?.available ?? 0),
        entries: shared.entries,
      };
      await db.skillPlans.add(plan);
      syncAfterEdit();
      setCommunityOpen(false);
      navigate(`/skills/plans/${plan.id}`);
    } finally {
      copyingFromCommunity.current = false;
    }
  }

  return (
    <>
      <div className="flex gap-1">
        <Button variant="primary" size="sm" onClick={() => void handleCreate()}>
          {t('plans.create')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              size="sm"
              icon={<Icon.Expanded size={Icon.ICON_SIZE.sm} />}
              label={t('plans.newPlanOptions')}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={newPlanMenu.onCloseAutoFocus}>
            <DropdownMenuItem onSelect={() => newPlanMenu.run(() => setCertifiedOpen(true))}>
              {t('plans.fromCertifiedItem')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => newPlanMenu.run(() => setCommunityOpen(true))}>
              {t('plans.fromCommunityItem')}
            </DropdownMenuItem>
            {onOptimizeQueue && (
              <DropdownMenuItem
                aria-label={t('plans.fromQueueOptimizedItem')}
                aria-disabled={queueEmpty || undefined}
                onSelect={(event) => {
                  if (queueEmpty) event.preventDefault();
                  else newPlanMenu.run(onOptimizeQueue);
                }}
                aria-describedby={queueEmpty ? queueEmptyId : undefined}
                className={queueEmpty ? 'flex-col items-start opacity-50' : undefined}
              >
                <span className="block">{t('plans.fromQueueOptimizedItem')}</span>
                {queueEmpty && (
                  <span id={queueEmptyId} className="block text-[0.6875rem] text-text-dim">
                    {t('plans.optimizeQueueEmptyTip')}
                  </span>
                )}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {certifiedOpen && (
        <CertifiedPlanDialog
          characterId={activeCharacterId}
          onPick={(plan, skillNameFor, trained) =>
            void handleCreateFromCertified(plan, skillNameFor, trained)
          }
          onClose={() => setCertifiedOpen(false)}
        />
      )}
      {communityOpen && (
        <Suspense fallback={null}>
          <CommunityPlansDialog
            characterId={activeCharacterId}
            onCopy={(shared) => void handleCreateFromCommunity(shared)}
            onClose={closeCommunity}
          />
        </Suspense>
      )}
    </>
  );
}
