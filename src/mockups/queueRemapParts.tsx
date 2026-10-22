import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { placeRemaps, type PlaceRemapsResult } from '@/engine/optimizer';
import type { EngineSkill } from '@/engine/types';
import { romanLevel } from '@/engine/projection';
import { loadSkillCatalog } from '@/features/skills/skillMap';
import { remapInstruction } from '@/features/skills/planner/remapInstruction';
import { MIN_MEANINGFUL_SAVINGS_SECONDS } from '@/features/skills/planner/planHeaderStats';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { NewComponent } from './NewComponent';
import { SCENARIOS, queueEntries, type ScenarioName } from './queueRemapFixtures';

const DAY_MS = 86_400_000;

/**
 * Puts a proposed control inside a real page's DOM (the mockup can't edit the
 * page): waits for `find` to return a host, appends a slot there, and portals
 * `children` into it.
 */
function IntoPage({ find, children }: { find: () => Element | null; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let made: HTMLElement | null = null;
    const attach = () => {
      const host = find();
      if (!host || made) return Boolean(made);
      made = document.createElement('div');
      host.appendChild(made);
      setSlot(made);
      return true;
    };
    if (attach()) return () => made?.remove();
    const observer = new MutationObserver(() => {
      if (attach()) observer.disconnect();
    });
    observer.observe(document.body, { subtree: true, childList: true });
    return () => {
      observer.disconnect();
      made?.remove();
    };
  }, [find]);
  return slot ? createPortal(children, slot) : null;
}

/** The Attributes panel body on desktop (the `Remaps:` line's parent), the bare chip section on a phone. */
function findAttributesHost(): Element | null {
  const remapLine = [...document.querySelectorAll('aside p')].find((p) =>
    p.textContent?.startsWith('Remaps:')
  );
  if (remapLine?.parentElement) return remapLine.parentElement;
  return document.querySelector('aside section[aria-label="Attributes"]');
}

/** Portals `children` into the real Attributes panel. */
export function IntoAttributesPanel({ children }: { children: ReactNode }) {
  return <IntoPage find={findAttributesHost}>{children}</IntoPage>;
}

/** Proposed: the queue page's way in, under the remap budget it acts on. */
export function RemapAdviceAction({ label = 'Remap advice' }: { label?: string }) {
  return (
    <div className="mt-2">
      <NewComponent name="Remap advice action">
        <Button size="sm" align="start" className="w-full">
          <span aria-hidden="true" className="shrink-0 text-text-dim">
            <Icon.OptimizeRemaps size={Icon.ICON_SIZE.sm} />
          </span>
          <span className="flex-1">{label}</span>
        </Button>
      </NewComponent>
    </div>
  );
}

function useEngineSkills(): ReadonlyMap<number, EngineSkill> | null {
  const [skills, setSkills] = useState<ReadonlyMap<number, EngineSkill> | null>(null);
  useEffect(() => {
    let live = true;
    void loadSkillCatalog().then((catalog) => live && setSkills(catalog.engineSkills));
    return () => {
      live = false;
    };
  }, []);
  return skills;
}

interface Advice {
  result: PlaceRemapsResult;
  remapCount: number;
  yearlyReadyAt: Date | null;
  bonus: number;
}

/**
 * The level training now is left out, as the plan editor leaves it out ("Trains
 * first in game"): advice starts at the next level, from when the current one
 * finishes. That keeps this figure and a saved plan's Remap savings the same.
 */
function headSeconds(name: ScenarioName, nowMs: number): number {
  const scenario = SCENARIOS[name];
  const head = queueEntries(scenario.queue, scenario.attributes, nowMs)[0];
  return head?.finish_date ? (new Date(head.finish_date).getTime() - nowMs) / 1000 : 0;
}

function adviceFor(
  name: ScenarioName,
  skills: ReadonlyMap<number, EngineSkill>,
  nowMs: number
): PlaceRemapsResult {
  const scenario = SCENARIOS[name];
  const steps = scenario.queue
    .slice(1)
    .map((s) => ({ skillTypeID: s.skillTypeID, level: s.level }));
  const notBefore = scenario.yearlyInDays * 86_400 - headSeconds(name, nowMs);
  return placeRemaps(steps, skills, {
    remapCount: Math.min(2, scenario.bonusRemaps + 1),
    currentAttributes: scenario.attributes,
    ...(scenario.yearlyInDays <= 0
      ? {}
      : { timedRemap: { notBeforeSeconds: Math.max(0, notBefore) } }),
  });
}

/** Runs the planner's own `placeRemaps` on the scenario's queue, with its live remap budget. */
function useAdvice(name: ScenarioName, nowMs: number): Advice | null {
  const skills = useEngineSkills();
  return useMemo(() => {
    if (!skills) return null;
    const scenario = SCENARIOS[name];
    const yearlyReady = scenario.yearlyInDays <= 0;
    const yearlyReadyAt = yearlyReady ? null : new Date(nowMs + scenario.yearlyInDays * DAY_MS);
    return {
      result: adviceFor(name, skills, nowMs),
      remapCount: Math.min(2, scenario.bonusRemaps + 1),
      yearlyReadyAt,
      bonus: scenario.bonusRemaps,
    };
  }, [skills, name, nowMs]);
}

function useSkillNames(): ReadonlyMap<number, string> {
  const skills = useEngineSkills();
  return useMemo(
    () => new Map([...(skills?.entries() ?? [])].map(([id, s]) => [id, s.name])),
    [skills]
  );
}

/**
 * Proposed: Remap advice for the live queue. Same body as the plan editor's
 * `RemapPreviewModal` (savings line, then one row per segment with its remap
 * instruction), framed for a queue: nothing to Accept, since a remap is made
 * in game. The action is "Save as skill plan", which keeps the advice as
 * Remap Markers on a new plan.
 */
export function QueueRemapAdviceModal({ scenario }: { scenario: ScenarioName }) {
  const { t } = useTranslation();
  const [nowMs] = useState(() => Date.now());
  const advice = useAdvice(scenario, nowMs);
  const names = useSkillNames();
  const queue = SCENARIOS[scenario].queue;
  const label = (index: number) => {
    // Segment indexes count from the level after the one training now.
    const step = queue[index + 1];
    return step ? `${names.get(step.skillTypeID) ?? '…'} ${romanLevel(step.level)}` : '';
  };
  const saves = advice !== null && advice.result.savingsSeconds >= MIN_MEANINGFUL_SAVINGS_SECONDS;
  const empty = queue.length === 0;
  // The queue's own end, from ESI's finish dates as the page shows it; the
  // remap brings it in by the optimizer's savings.
  const entries = queueEntries(queue, SCENARIOS[scenario].attributes, nowMs);
  const lastFinish = entries.at(-1)?.finish_date;
  const endsNow = lastFinish ? new Date(lastFinish) : null;
  const remainingSeconds = endsNow ? (endsNow.getTime() - nowMs) / 1000 : 0;
  const endsAfter =
    endsNow && advice ? new Date(endsNow.getTime() - advice.result.savingsSeconds * 1000) : null;

  const budget =
    advice &&
    `${t('plans.remapBudget', { bonus: advice.bonus })} ${
      advice.yearlyReadyAt
        ? t('plans.remapBudgetYearlyFrom', { date: formatLocalDate(advice.yearlyReadyAt) })
        : t('plans.remapBudgetYearlyReady')
    }`;

  return (
    <Modal
      open
      onClose={() => undefined}
      title="Remap advice"
      footer={
        <div className="flex justify-end gap-2">
          {saves && (
            <Button variant="primary" size="sm">
              Save as skill plan
            </Button>
          )}
          <Button size="sm">{t('plans.remapDismiss')}</Button>
        </div>
      }
    >
      <NewComponent name="QueueRemapAdvice">
        <div className="space-y-2 text-xs">
          <p className="text-text-dim">
            {empty
              ? 'For the skill queue in game.'
              : `For the skill queue in game: ${queue.length} skills, ${formatCountdown(
                  remainingSeconds
                )} on your current attributes.`}
          </p>
          {budget && <p className="text-[0.6875rem] text-text-dim">{budget}</p>}
          {empty ? (
            <p className="text-text-dim">
              Your skill queue is empty, so there is nothing to time a remap against. Queue skills
              in game, or plan ahead in a skill plan.
            </p>
          ) : !advice ? null : saves ? (
            <>
              <p className="font-semibold text-success">
                {t('plans.remapSaves', { duration: formatCountdown(advice.result.savingsSeconds) })}
              </p>
              <p className="text-text-dim">
                {`Queue ends ${formatLocalDate(endsAfter!)} instead of ${formatLocalDate(endsNow!)}. ${label(-1)} is training now and finishes first, as a plan counts it.`}
              </p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {advice.result.segments.map((segment, index) => (
                  <li key={index} className="space-y-0.5 border-b border-line pb-1 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {t('plans.segment', { index: index + 1 })}
                      </span>
                      <span className="tabular-nums text-text-dim">
                        {formatCountdown(segment.seconds)}
                      </span>
                    </div>
                    <p className="text-text-dim">
                      {segment.remap
                        ? t('plans.segmentRemap', {
                            skill: label(segment.startIndex),
                            attributes: remapInstruction(segment.attributes),
                          })
                        : t('plans.segmentCurrent', { skill: label(segment.startIndex) })}
                    </p>
                    {segment.remap &&
                      advice.yearlyReadyAt &&
                      index === advice.result.segments.length - 1 && (
                        <p className="text-text-dim">
                          {t('plans.optimizeConfirmYearlyAfter', {
                            date: formatLocalDate(advice.yearlyReadyAt),
                          })}
                        </p>
                      )}
                  </li>
                ))}
              </ul>
              <p className="text-[0.6875rem] text-text-dim">
                Remapping is done in game, in the Character Sheet. EVE recalculates the queue&apos;s
                finish dates once you do.
              </p>
            </>
          ) : (
            <p className="text-text-dim">
              Your current attributes already suit this queue: no remap makes it meaningfully
              faster. Keep your remap for a queue that changes attribute pairs.
            </p>
          )}
        </div>
      </NewComponent>
    </Modal>
  );
}
