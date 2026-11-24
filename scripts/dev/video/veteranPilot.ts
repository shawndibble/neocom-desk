/**
 * A seasoned pilot for the promo recordings: every skill in the bundled data trained, the gunnery
 * and drone support skills a level or two short so What to train and Improve Fit have something
 * to say, and no implants. Replaces the e2e fixture's handful of skills.
 */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { CHARACTER_ID } from '../../../e2e/support/fixtureData';

const SHORT: Record<number, number> = {
  3315: 4, // Surgical Strike
  3310: 4, // Rapid Firing
  3312: 4, // Motion Prediction
  3311: 4, // Sharpshooter
  3317: 4, // Trajectory Analysis
  3442: 4, // Drone Interfacing
  3316: 4, // Controlled Bursts
};

const SP_AT = [0, 250, 1415, 8000, 45255, 256000];

export async function installVeteranPilot(page: Page): Promise<void> {
  const skills = (
    JSON.parse(
      readFileSync(new URL('../../../public/data/skills.json', import.meta.url), 'utf8')
    ) as { typeID: number; rank: number }[]
  ).map((skill) => {
    const level = SHORT[skill.typeID] ?? 5;
    return {
      skill_id: skill.typeID,
      trained_skill_level: level,
      active_skill_level: level,
      skillpoints_in_skill: SP_AT[level] * skill.rank,
    };
  });
  const totalSp = skills.reduce((sum, skill) => sum + skill.skillpoints_in_skill, 0);
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route(new RegExp(`/characters/${CHARACTER_ID}/skills(\\?|$)`), (route) =>
    route.fulfill(json({ skills, total_sp: totalSp, unallocated_sp: 0 }))
  );
  await page.route(`https://esi.evetech.net/**/characters/${CHARACTER_ID}/implants**`, (route) =>
    route.fulfill(json([]))
  );
}
