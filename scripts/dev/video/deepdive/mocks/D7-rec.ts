/** Recording helpers for D7/D8: paced glide+click, slow typing, markers on the recorder's clock. */
import type { Locator, Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { clickHere, glideTo, glideToPoint } from '../../recorder';

export const nowS = () => Date.now() / 1000;

export class Marks {
  private list: { name: string; wall: number; note: string }[] = [];
  private firstGlideWall: number | null = null;
  mark(name: string, note = '') {
    this.list.push({ name, wall: nowS(), note });
  }
  noteGlide(wall: number) {
    if (this.firstGlideWall === null) this.firstGlideWall = wall;
  }
  /** After recording.stop(): converts wall times to seconds from the first frame via cursor.json. */
  write(dir: string) {
    const cursor = JSON.parse(readFileSync(`${dir}/cursor.json`, 'utf8')) as { events: { start: number }[] };
    const wallStart = this.firstGlideWall! - cursor.events[0].start;
    const markers = this.list.map((m) => ({ name: m.name, t: Math.round((m.wall - wallStart) * 100) / 100, note: m.note }));
    writeFileSync(`${dir}/markers.json`, JSON.stringify({ markers }, null, 2) + '\n');
  }
}

export function makeRig(page: Page, marks: Marks) {
  const glide = async (target: Locator, ms = 1000) => {
    marks.noteGlide(nowS());
    await glideTo(page, target, ms);
  };
  const glidePoint = async (x: number, y: number, ms = 1000) => {
    marks.noteGlide(nowS());
    await glideToPoint(page, x, y, ms);
  };
  /** Glide, pause over the target (~400 ms), click. */
  const press = async (target: Locator, ms = 1000) => {
    await target.scrollIntoViewIfNeeded();
    await glide(target, ms);
    await page.waitForTimeout(450);
    await clickHere(page);
  };
  const hold = (ms = 4000) => page.waitForTimeout(ms);
  /** Visible typing: about 60 ms a character. */
  const type = async (text: string) => {
    await page.keyboard.type(text, { delay: 65 });
  };
  /** Small smooth scroll: a few wheel notches with pauses. */
  const scroll = async (total: number, step = 40) => {
    let done = 0;
    while (done < total) {
      await page.mouse.wheel(0, step);
      done += step;
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(600);
  };
  return { glide, glidePoint, press, hold, type, scroll };
}
