import type { Locator, Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clickHere, glideTo, glideToPoint, placePointer, startRecording } from '../../recorder';

export const OUT = process.env.VIDEO_OUT ?? '/mnt/project-files/deep-dive-video/captures/D15';

export interface Take {
  page: Page;
  mark: (name: string, note: string) => void;
  click: (target: Locator, glideMs?: number) => Promise<void>;
  hover: (target: Locator, glideMs?: number) => Promise<void>;
  rightClick: (target: Locator, glideMs?: number) => Promise<void>;
  glidePoint: (x: number, y: number, ms?: number) => Promise<void>;
  clickPoint: () => Promise<void>;
  hold: (ms?: number) => Promise<void>;
  settle: (ms?: number) => Promise<void>;
  type: (text: string) => Promise<void>;
  scrollBy: (dy: number, ms?: number) => Promise<void>;
  tap: (target: Locator) => Promise<void>;
  swipeLeft: (target: Locator, distance?: number, ms?: number) => Promise<void>;
  scrollTouch: (target: Locator, dy: number, ms?: number) => Promise<void>;
}

export async function record(
  page: Page,
  name: string,
  body: (take: Take) => Promise<void>,
  options: { phone?: boolean } = {}
): Promise<void> {
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  const vp = page.viewportSize() ?? { width: 1440, height: 960 };
  await placePointer(page, vp.width / 2, vp.height / 2);
  const rec = await startRecording(page, dir);
  const markers: { name: string; wall: number; note: string }[] = [];
  const T0 = Date.now() / 1000;
  await glideToPoint(page, vp.width / 2, vp.height / 2, 100);
  const cdp = options.phone ? await page.context().newCDPSession(page) : null;
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp!.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
  const center = async (target: Locator) => {
    const box = await target.boundingBox();
    if (!box) throw new Error(`no box for ${target.toString()}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
  };
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
    rightClick: async (target, ms = 1000) => {
      await glideTo(page, target, ms);
      await page.waitForTimeout(400);
      await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(70);
      await page.mouse.up({ button: 'right' });
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
        await page.evaluate(
          (d) => document.querySelector('main')?.scrollBy(0, d) ?? window.scrollBy(0, d),
          dy / steps
        );
        await page.waitForTimeout(ms / steps);
      }
    },
    tap: async (target) => {
      const { x, y } = await center(target);
      await glideToPoint(page, x, y, 500);
      await page.waitForTimeout(300);
      await touch('touchStart', x, y);
      await page.waitForTimeout(80);
      await touch('touchEnd', x, y);
    },
    swipeLeft: async (target, distance = 150, ms = 1800) => {
      const { x, y, box } = await center(target);
      const startX = Math.min(x + box.width / 4, box.x + box.width - 40);
      await glideToPoint(page, startX, y, 500);
      await page.waitForTimeout(400);
      await touch('touchStart', startX, y);
      const steps = 24;
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', startX - (distance * i) / steps, y);
        await page.waitForTimeout(ms / steps);
      }
      await touch('touchEnd', startX - distance, y);
    },
    scrollTouch: async (target, dy, ms = 1200) => {
      const { x, y } = await center(target);
      await touch('touchStart', x, y);
      const steps = 20;
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', x, y - (dy * i) / steps);
        await page.waitForTimeout(ms / steps);
      }
      await touch('touchEnd', x, y - dy);
    },
  };
  try {
    await body(take);
  } finally {
    const { frames, seconds } = await rec.stop();
    const cursor = JSON.parse(readFileSync(join(dir, 'cursor.json'), 'utf8')) as {
      events: { start: number }[];
      viewport?: unknown;
    };
    const wallStart = T0 - (cursor.events[0]?.start ?? 0);
    cursor.viewport = { w: vp.width, h: vp.height };
    writeFileSync(join(dir, 'cursor.json'), JSON.stringify(cursor, null, 2) + '\n');
    const out = markers.map((m) => ({
      name: m.name,
      t: Math.round((m.wall - wallStart) * 100) / 100,
      note: m.note,
    }));
    writeFileSync(join(dir, 'markers.json'), JSON.stringify({ markers: out }, null, 2) + '\n');
    console.log(`TAKE ${name}: ${frames} frames, ${seconds.toFixed(1)}s`);
  }
}
