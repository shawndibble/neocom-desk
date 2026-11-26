/**
 * D4's own skill override: Arden's ESI skills with a few skills lowered, so the Drake fit uses
 * modules he cannot use yet. Registered through openWorld's `before`, so it wins over the shared
 * world's answer and touches nothing outside this capture.
 */
import type { Page } from '@playwright/test';
import { ARDEN } from '../cast';
import { SKILLS, characterSkills } from '../skills';

const SP_AT = [0, 250, 1415, 8000, 45255, 256000];

/** The Drake fit's skill gaps: two missing module skills, two CPU skills at IV, and missile skills below V. */
export const D4_LOWERED: Record<string, number> = {
  'Tactical Shield Manipulation': 3,
  'Shield Operation': 2,
  'CPU Management': 4,
  'Weapon Upgrades': 4,
  'Heavy Missiles': 4,
  'Rapid Launch': 4,
  'Missile Bombardment': 3,
  'Warhead Upgrades': 4,
  'Missile Projection': 4,
  'Shield Management': 4,
};

export async function installLoweredSkills(page: Page, lowered: Record<string, number>) {
  const byName = new Map(SKILLS.map((skill) => [skill.name, skill]));
  // The planner backs the plugged implants out of this sheet and calls anything but 99 base points impossible.
  await page.route(
    new RegExp(`^https://esi\\.evetech\\.net/(?:[^/]+/)?characters/${ARDEN.id}/attributes/?(?:\\?.*)?$`),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          // 99 base points (21/17/22/22/17) plus Arden's +5 Perception and +5 Willpower implants.
          intelligence: 21,
          memory: 17,
          perception: 27,
          willpower: 27,
          charisma: 17,
          bonus_remaps: 1,
          last_remap_date: new Date(Date.now() - 212 * 24 * 3600_000).toISOString(),
        }),
      });
    }
  );
  await page.route(new RegExp(`^https://esi\\.evetech\\.net/(?:[^/]+/)?characters/${ARDEN.id}/skills/?(?:\\?.*)?$`), async (route) => {
    const base = characterSkills(ARDEN.id);
    const skills = base.skills
      .map((entry) => {
        const def = SKILLS.find((skill) => skill.typeID === entry.skill_id)!;
        const level = lowered[def.name];
        if (level === undefined) return entry;
        return {
          ...entry,
          trained_skill_level: level,
          active_skill_level: level,
          skillpoints_in_skill: Math.round(SP_AT[level] * byName.get(def.name)!.rank),
        };
      })
      .filter((entry) => entry.trained_skill_level > 0);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ ...base, skills }),
    });
  });
}
