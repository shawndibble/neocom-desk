#!/usr/bin/env node
// `npm run shots:resize`: writes the smaller landing-page variants of every
// original in public/screenshots/ as `<file>-<width>.webp`.
//
// The originals are the files without a `-<width>` suffix. Widths must match
// DESKTOP_VARIANT_WIDTHS / PHONE_VARIANT_WIDTHS in
// src/features/landing/screenshots.ts (screenshotReferences.test.ts fails on
// drift). Resizing runs in the repo's Playwright Chromium (canvas -> webp), so
// it needs no image dependency. Re-running regenerates every variant.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const DIR = resolve(import.meta.dirname, '..', 'public', 'screenshots');
const PHONE_WIDTHS = [416];
const DESKTOP_WIDTHS = [640, 1280];
const QUALITY = 0.8;

const originals = readdirSync(DIR)
  .filter((name) => name.endsWith('.webp') && !/-\d+\.webp$/.test(name))
  .sort();

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const name of originals) {
    const base = name.replace(/\.webp$/, '');
    const widths = base.startsWith('phone-') ? PHONE_WIDTHS : DESKTOP_WIDTHS;
    const dataUrl = `data:image/webp;base64,${readFileSync(join(DIR, name)).toString('base64')}`;
    for (const width of widths) {
      const out = await page.evaluate(
        async ({ src, width, quality }) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = Math.round((img.naturalHeight * width) / img.naturalWidth);
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/webp', quality);
        },
        { src: dataUrl, width, quality: QUALITY }
      );
      const file = join(DIR, `${base}-${width}.webp`);
      writeFileSync(file, Buffer.from(out.split(',')[1], 'base64'));
      console.log(`${base}-${width}.webp`);
    }
  }
} finally {
  await browser.close();
}
