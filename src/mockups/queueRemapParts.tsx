import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Toast, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { EngineSkill } from '@/engine/types';
import { romanLevel } from '@/engine/projection';
import { loadSkillCatalog } from '@/features/skills/skillMap';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { SCENARIOS, type ScenarioName } from './queueRemapFixtures';
import { queueAdvice, savesTime } from './queueRemapAdvice';

const DAY_MS = 86_400_000;

/**
 * Puts the proposed button into the real Attributes card (the mockup can't
 * edit the page): after the "Remaps: …" line on desktop, after the attribute
 * chips on a phone (which shows the chips bare). Re-attaches when the card
 * re-renders as its data arrives.
 */
function IntoAttributesCard({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let made: HTMLElement | null = null;
    const host = () => {
      const remapLine = [...document.querySelectorAll('aside p')].find((p) =>
        p.textContent?.startsWith('Remaps:')
      );
      return (
        remapLine?.parentElement ?? document.querySelector('aside section[aria-label="Attributes"]')
      );
    };
    const attach = () => {
      if (made?.isConnected) return;
      const target = host();
      if (!target) return;
      made?.remove();
      made = document.createElement('div');
      target.appendChild(made);
      setSlot(made);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => {
      observer.disconnect();
      made?.remove();
    };
  }, []);
  return slot ? createPortal(children, slot) : null;
}

/**
 * Proposed: Optimize queue, at the foot of the Attributes card under the remap
 * budget it spends, past a divider, at the card's full width. An existing
 * `Button` with the Optimize button's icon; one press makes the plan, so no
 * "…". With an empty queue it stays focusable (`aria-disabled`) and says why
 * in its tooltip.
 */
export function OptimizeQueueButton({ emptyQueue = false }: { emptyQueue?: boolean }) {
  const button = (
    <Button
      size="sm"
      align="start"
      className={emptyQueue ? 'w-full cursor-not-allowed opacity-40' : 'w-full'}
      aria-disabled={emptyQueue || undefined}
    >
      <span aria-hidden="true" className="shrink-0 text-text-dim">
        <Icon.OptimizeRemaps size={Icon.ICON_SIZE.sm} />
      </span>
      <span className="flex-1">Optimize queue</span>
    </Button>
  );
  return (
    <IntoAttributesCard>
      <div className="mt-3 border-t border-line pt-3">
        {emptyQueue ? (
          <Tooltip content="Your skill queue is empty: nothing to optimize.">{button}</Tooltip>
        ) : (
          button
        )}
      </div>
    </IntoAttributesCard>
  );
}

function useEngineSkills(): ReadonlyMap<number, EngineSkill> | null {
  const [skills, setSkills] = useState<ReadonlyMap<number, EngineSkill> | null>(null);
  useEffect(() => {
    let live = true;
    loadSkillCatalog().then(
      (catalog) => live && setSkills(catalog.engineSkills),
      () => undefined
    );
    return () => {
      live = false;
    };
  }, []);
  return skills;
}

/**
 * The toast Optimize queue leaves: on the new plan's editor (Undo deletes the
 * plan and goes back), or on the Plans page when no remap pays and no plan
 * was made. Text is built from the same `placeRemaps` run as the plan.
 */
export function OptimizeQueueToast({
  scenario,
  planName,
}: {
  scenario: ScenarioName;
  planName: string;
}) {
  const skills = useEngineSkills();
  const [nowMs] = useState(() => Date.now());
  const toast = useMemo(() => {
    if (!skills) return null;
    const s = SCENARIOS[scenario];
    const result = queueAdvice(scenario, skills, nowMs);
    if (!savesTime(result)) {
      return {
        madePlan: false,
        message:
          'Your attributes already suit your skill queue: no remap makes it faster, so no plan was made.',
      };
    }
    const remaps = result.segments.filter((segment) => segment.remap);
    const first = s.queue[remaps[0]!.startIndex + 1]!;
    const firstName = `${skills.get(first.skillTypeID)?.name ?? ''} ${romanLevel(first.level)}`;
    const saving = formatCountdown(result.savingsSeconds);
    const what =
      remaps.length > 1
        ? `${remaps.length} remaps save ${saving}`
        : `remap before ${firstName} saves ${saving}`;
    const when =
      s.yearlyInDays > 0
        ? ` It waits for your yearly remap on ${formatLocalDate(new Date(nowMs + s.yearlyInDays * DAY_MS))}.`
        : '';
    return { madePlan: true, message: `Made "${planName}": ${what}.${when}` };
  }, [skills, scenario, nowMs, planName]);
  if (!toast) return null;
  return toast.madePlan ? (
    <Toast
      message={toast.message}
      undo={{ label: 'Undo', onUndo: () => undefined }}
      onClose={() => undefined}
    />
  ) : (
    <Toast message={toast.message} durationMs={600_000} onClose={() => undefined} />
  );
}
