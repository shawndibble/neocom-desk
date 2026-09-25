#!/usr/bin/env node
// Add NotificationSettingsActivity to a Bubblewrap-generated Android project.
//
// `bubblewrap update` regenerates AndroidManifest.xml from its template, so
// this runs after every update and before `bubblewrap build`. Safe to re-run:
// the Java file is overwritten and the manifest entry is only added once.
// See docs/ANDROID-TWA.md "Notification settings button".
//
//   node scripts/twa/patch-android.mjs [path/to/bubblewrap/project]   (default: cwd)

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ACTIVITY = 'NotificationSettingsActivity';

const project = path.resolve(process.argv[2] ?? '.');
const { packageId } = JSON.parse(readFileSync(path.join(project, 'twa-manifest.json'), 'utf8'));
const main = path.join(project, 'app/src/main');

const javaDir = path.join(main, 'java', ...packageId.split('.'));
mkdirSync(javaDir, { recursive: true });
const source = readFileSync(path.join(HERE, `${ACTIVITY}.java`), 'utf8').replace(
  /^package [\w.]+;/m,
  `package ${packageId};`
);
writeFileSync(path.join(javaDir, `${ACTIVITY}.java`), source);

const manifestPath = path.join(main, 'AndroidManifest.xml');
const manifest = readFileSync(manifestPath, 'utf8');
if (manifest.includes(`android:name=".${ACTIVITY}"`)) {
  console.log(`${ACTIVITY}: already in AndroidManifest.xml`);
} else {
  // BROWSABLE is what lets Chrome launch it from the page's intent: URL.
  const entry = `
        <activity android:name=".${ACTIVITY}"
            android:exported="true"
            android:excludeFromRecents="true"
            android:noHistory="true"
            android:theme="@android:style/Theme.Translucent.NoTitleBar">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="neocomdesk" android:host="notification-settings" />
            </intent-filter>
        </activity>
    </application>`;
  if (!manifest.includes('</application>')) {
    console.error(`${manifestPath}: no </application> to insert before`);
    process.exit(1);
  }
  writeFileSync(manifestPath, manifest.replace('</application>', entry.trimStart()));
  console.log(`${ACTIVITY}: added to AndroidManifest.xml`);
}
