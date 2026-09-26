import type { ShipTreeClassSkill } from '@/sde/types';

const LEVELS = [1, 2, 3, 4, 5] as const;

/** One five-block bar per displayed class skill, filled to the level trained. */
export function SkillBlocks({
  skills,
  trainedLevel,
}: {
  skills: readonly ShipTreeClassSkill[];
  trainedLevel: (skillTypeID: number) => number;
}) {
  return (
    <>
      {skills.map((p) => {
        const have = trainedLevel(p.skillTypeID);
        return (
          <span key={p.skillTypeID} className="isis-blocks" aria-hidden="true">
            {LEVELS.map((lv) => (
              <i key={lv} className={lv <= have ? 'on' : undefined} />
            ))}
          </span>
        );
      })}
    </>
  );
}
