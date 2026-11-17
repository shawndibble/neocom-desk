import { useEffect, useState } from 'react';
import { loadSkills } from '@/sde/loadSde';

export type SkillNames = ReadonlyMap<number, { name: string; group: string }>;

const NONE: SkillNames = new Map();
let loading: Promise<SkillNames> | null = null;

function load(): Promise<SkillNames> {
  loading ??= loadSkills().then(
    (skills) =>
      new Map(skills.map((skill) => [skill.typeID, { name: skill.name, group: skill.groupName }])),
    () => {
      // The catalog could not load: skills show as ids; try again on the next visit.
      loading = null;
      return NONE;
    }
  );
  return loading;
}

/** Skill name and group by type id, from the static skill data; empty until it loads. */
export function useSkillNames(): SkillNames {
  const [names, setNames] = useState<SkillNames>(NONE);
  useEffect(() => {
    let live = true;
    void load().then((loaded) => {
      if (live) setNames(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  return names;
}
