/** Pacing and marker helpers shared by the D5, D9 and P11 specs (Shawn's pacing: 900-1200 ms glides, 400 ms pause, 3.5-5 s holds). */
import type { Locator, Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clickHere, glideTo, glideToPoint } from '../../recorder';

export const hold = (page: Page, seconds = 4) => page.waitForTimeout(seconds * 1000);

/** Glide to a target, pause over it, click. */
export async function pressOn(page: Page, target: Locator, glideMs = 1000) {
  await glideTo(page, target, glideMs);
  await page.waitForTimeout(400);
  await clickHere(page);
}

/** Glide and pause without clicking (to point at something). */
export async function pointAt(page: Page, target: Locator, glideMs = 1000) {
  await glideTo(page, target, glideMs);
  await page.waitForTimeout(400);
}

export async function glidePoint(page: Page, x: number, y: number, ms = 1000) {
  await glideToPoint(page, x, y, ms);
}

/** Visible typing, about 60 ms per character. */
export async function typeSlowly(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 60 });
}

/** Marker bookkeeping on the recorder's clock: anchor() right before the first glide of the take. */
export class Marks {
  private anchorWall = 0;
  private items: { name: string; wall: number; note: string }[] = [];
  anchor() {
    this.anchorWall = Date.now() / 1000;
  }
  mark(name: string, note: string) {
    this.items.push({ name, wall: Date.now() / 1000, note });
  }
  write(dir: string) {
    const cursor = JSON.parse(readFileSync(join(dir, 'cursor.json'), 'utf8'));
    const first = cursor.events[0]?.start ?? 0;
    const offset = this.anchorWall - first;
    const markers = this.items.map((m) => ({ name: m.name, t: Math.round((m.wall - offset) * 100) / 100, note: m.note }));
    writeFileSync(join(dir, 'markers.json'), JSON.stringify({ markers }, null, 2) + '\n');
  }
}

/** Smooth, small scroll of whatever is under the pointer (wheel steps, never the pointer itself). */
export async function smoothScroll(page: Page, totalPx: number, stepPx = 30, stepMs = 45) {
  const steps = Math.ceil(Math.abs(totalPx) / stepPx);
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, Math.sign(totalPx) * stepPx);
    await page.waitForTimeout(stepMs);
  }
}
