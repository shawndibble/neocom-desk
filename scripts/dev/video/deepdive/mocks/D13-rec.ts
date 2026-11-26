/** D13 recording helpers: paced pointer steps, markers on the recorder's clock, take folders. */
import type { Locator, Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clickHere, glideTo, glideToPoint, placePointer, startRecording } from '../../recorder';

export const OUT = process.env.VIDEO_OUT ?? '/mnt/project-files/deep-dive-video/captures/D13';

export interface Take {
  page: Page;
  mark: (name: string, note: string) => void;
  /** Glide over a target, pause 400 ms, click. */
  click: (target: Locator, glideMs?: number) => Promise<void>;
  /** Glide over a target and rest there (no click). */
  hover: (target: Locator, glideMs?: number) => Promise<void>;
  glidePoint: (x: number, y: number, ms?: number) => Promise<void>;
  clickPoint: (x: number, y: number) => Promise<void>;
  hold: (ms?: number) => Promise<void>;
  /** Wait for the page to settle after navigation, then hold 2 s. */
  settle: (ms?: number) => Promise<void>;
  type: (text: string) => Promise<void>;
  scrollBy: (dy: number, ms?: number) => Promise<void>;
}

export async function record(page: Page, name: string, body: (take: Take) => Promise<void>): Promise<void> {
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  await placePointer(page, 720, 480);
  const rec = await startRecording(page, dir);
  const markers: { name: string; wall: number; note: string }[] = [];
  const T0 = Date.now() / 1000;
  await glideToPoint(page, 720, 480, 100); // first cursor event: pins the recorder's clock
  const take: Take = {
    page,
    mark: (n, note) => markers.push({ name: n, wall: Date.now() / 1000, note }),
    hover: async (target, ms = 1000) => {
      await glideTo(page, target, ms);
      await page.waitForTimeout(400);
    },
    click: async (target, ms = 1000) => {
      await glideTo(page, target, ms);
      await page.waitForTimeout(400);
      await clickHere(page);
    },
    glidePoint: async (x, y, ms = 1000) => {
      await glideToPoint(page, x, y, ms);
      await page.waitForTimeout(400);
    },
    clickPoint: async () => {
      await clickHere(page);
    },
    hold: (ms = 4000) => page.waitForTimeout(ms),
    settle: async (ms = 1500) => {
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(ms);
      await page.waitForTimeout(2000);
    },
    type: async (text) => {
      await page.keyboard.type(text, { delay: 60 });
    },
    scrollBy: async (dy, ms = 1200) => {
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        await page.evaluate((d) => document.querySelector('main')?.scrollBy(0, d) ?? window.scrollBy(0, d), dy / steps);
        await page.waitForTimeout(ms / steps);
      }
    },
  };
  try {
    await body(take);
  } finally {
    const { frames, seconds } = await rec.stop();
    const cursor = JSON.parse(readFileSync(join(dir, 'cursor.json'), 'utf8')) as { events: { start: number }[] };
    const wallStart = T0 + 0 - (cursor.events[0]?.start ?? 0);
    const out = markers.map((m) => ({ name: m.name, t: Math.round((m.wall - wallStart) * 100) / 100, note: m.note }));
    writeFileSync(join(dir, 'markers.json'), JSON.stringify({ markers: out }, null, 2) + '\n');
    console.log(`TAKE ${name}: ${frames} frames, ${seconds.toFixed(1)}s`);
  }
}
