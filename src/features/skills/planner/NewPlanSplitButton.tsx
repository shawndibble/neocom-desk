import { Suspense, useRef, useState } from 'react';
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

// Firebase stays out of the Skills bundle until a pilot opens the Community browse.
const CommunityPlansDialog = lazyNamed(
  () => import('@/features/communities/CommunityPlansDialog'),
  'CommunityPlansDialog'
);

/**
 * A split button: "New plan" stays one click for a blank plan, and the caret
 * holds the other starting points (certified, community) without costing a
 * narrow header the width a second labelled button would. Owns the dialogs
 * those starts open, so every place that offers "New plan" gets the same set.
 * A host that also offers the certified start elsewhere (the no-plans card's
 * hint link) passes `certified` to drive this dialog, not render a second one.
 */
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
  /** Adds "from your skill queue, optimized" (the phone's home for Optimize queue); omitted hides it. */
  onOptimizeQueue?: () => void;
  /** The in-game queue is empty: the item stays listed but disabled. */
  queueEmpty?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const newPlanMenu = useOpenAfterMenu();
  const [certifiedOpenState, setCertifiedOpenState] = useState(false);
  const certifiedOpen = certified ? certified.open : certifiedOpenState;
  const setCertifiedOpen = certified ? certified.onOpenChange : setCertifiedOpenState;
  // `?browse=community` (the Community page's link) opens the browse straight away.
  const [communityOpen, setCommunityOpen] = useState(
    () => new URLSearchParams(location.search).get('browse') === 'community'
  );
  const copyingFromCommunity = useRef(false);

  function syncAfterEdit() {
    if (isSyncConfigured()) scheduleSync(activeCharacterId, { collections: ['plans'] });
  }

  function closeCommunity() {
    setCommunityOpen(false);
    // The link's own param must not reopen the dialog on a back or a remount.
    if (new URLSearchParams(location.search).has('browse')) {
      navigate({ pathname: location.pathname }, { replace: true });
    }
  }

  async function handleCreate() {
    const plan = newPlan(activeCharacterId, t('plans.newPlanName'), remapInfo?.available ?? 0);
    await db.skillPlans.add(plan);
    syncAfterEdit();
    // The flag lands the pilot on the new plan's list row, ready to rename.
    navigate(`/skills/plans/${plan.id}`, { state: { focusName: true } });
  }

  // Named after the certified plan already, so no rename-on-arrival flag.
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
    // A second click while the first is still adding must not make a second plan.
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
                disabled={queueEmpty}
                onSelect={() => newPlanMenu.run(onOptimizeQueue)}
              >
                {t('plans.fromQueueOptimizedItem')}
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
