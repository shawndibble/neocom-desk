/**
 * "Retarget group" (issue #632): a bulk write to every checked member plan's
 * own hub/facility/security/build-system, plus the group's own snapshot of
 * what was applied. Two steps, one Save/Apply each — editing the form fields
 * writes nothing until Apply, matching Build Location's own "Override" fold
 * (CONTEXT.md).
 *
 * The four fields move as one bundle: there is no per-field apply, the same
 * rule `facilityDefaults.ts` documents for facility/rig/tax ("splitting them
 * lets the three drift into a combination the pilot never chose").
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { FACILITY_PRESETS, type FacilityKind } from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, getTradeHub } from '@/market/hubs';
import { BuildSystemInput } from './BuildSystemInput';
import type { BuildGroup, BuildGroupSnapshot } from './buildGroups';

export type RetargetTarget = Omit<BuildGroupSnapshot, 'appliedAt'>;

interface RetargetGroupDialogProps {
  group: BuildGroup;
  plans: readonly BuildPlanRecord[];
  onApply: (target: RetargetTarget, planIds: string[]) => void;
  onClose: () => void;
}

function initialTarget(group: BuildGroup): RetargetTarget {
  if (group.snapshot) {
    const { hubId, facility, security, buildSystemId, buildSystemName } = group.snapshot;
    return { hubId, facility, security, buildSystemId, buildSystemName };
  }
  return {
    hubId: DEFAULT_TRADE_HUB.id,
    facility: 'npcStation',
    security: DEFAULT_TRADE_HUB.security,
  };
}

export function RetargetGroupDialog({ group, plans, onApply, onClose }: RetargetGroupDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [target, setTarget] = useState<RetargetTarget>(() => initialTarget(group));
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(plans.map((p) => p.id))
  );

  const hub = getTradeHub(target.hubId) ?? DEFAULT_TRADE_HUB;

  function toggle(planId: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  return (
    <Modal open onClose={onClose} title={t('industry.retargetGroup', { name: group.name })}>
      {step === 'form' ? (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-text-dim">{t('industry.retargetFormHint')}</p>

          <label className="flex flex-col gap-1">
            {t('industry.tradeHub')}
            <Select
              value={target.hubId}
              onValueChange={(value) => {
                const nextHub = getTradeHub(value as BuildPlanRecord['hubId']) ?? DEFAULT_TRADE_HUB;
                setTarget((current) => ({
                  ...current,
                  hubId: nextHub.id,
                  // Follows the hub only while no build system is named —
                  // once one is, the security band is the system's, the
                  // same rule `BuildSystemInput`'s own caller applies.
                  ...(current.buildSystemId === undefined ? { security: nextHub.security } : {}),
                }));
              }}
            >
              <SelectTrigger aria-label={t('industry.tradeHub')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRADE_HUBS.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            {t('industry.facility')}
            <Select
              value={target.facility}
              onValueChange={(value) =>
                setTarget((current) => ({ ...current, facility: value as FacilityKind }))
              }
            >
              <SelectTrigger aria-label={t('industry.facility')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(FACILITY_PRESETS).map((f) => (
                  <SelectItem key={f.kind} value={f.kind}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <BuildSystemInput
            systemName={target.buildSystemName}
            hubSystemName={hub.systemName}
            securityLabel={t(`industry.${target.security}`)}
            onChange={(system) =>
              setTarget((current) => ({
                ...current,
                buildSystemId: system?.id,
                buildSystemName: system?.name,
                security: system === null ? hub.security : (system.security ?? current.security),
              }))
            }
          />

          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" onClick={onClose}>
              {t('industry.cancel')}
            </Button>
            <Button size="sm" onClick={() => setStep('preview')}>
              {t('industry.retargetContinue')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-text-dim">{t('industry.retargetPreviewHint')}</p>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto">
            {plans.map((plan) => (
              <li key={plan.id} className="flex items-center gap-2 px-1 py-1.5">
                <input
                  type="checkbox"
                  id={`retarget-plan-${plan.id}`}
                  checked={checked.has(plan.id)}
                  onChange={() => toggle(plan.id)}
                />
                <label htmlFor={`retarget-plan-${plan.id}`} className="flex flex-1 flex-col">
                  <span>{plan.name}</span>
                  <span className="text-text-dim">
                    {plan.buildSystemName
                      ? t('industry.retargetCurrentValuesWithSystem', {
                          hub: getTradeHub(plan.hubId)?.name ?? plan.hubId,
                          facility: FACILITY_PRESETS[plan.facility].name,
                          security: t(`industry.${plan.security}`),
                          buildSystem: plan.buildSystemName,
                        })
                      : t('industry.retargetCurrentValues', {
                          hub: getTradeHub(plan.hubId)?.name ?? plan.hubId,
                          facility: FACILITY_PRESETS[plan.facility].name,
                          security: t(`industry.${plan.security}`),
                        })}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between gap-2">
            <Button size="sm" onClick={() => setStep('form')}>
              {t('industry.retargetBack')}
            </Button>
            <div className="flex gap-2">
              <Button size="sm" onClick={onClose}>
                {t('industry.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => onApply(target, [...checked])}
                disabled={checked.size === 0}
              >
                {t('industry.retargetApply')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
