# J — Shell polish (app shell / design-system plumbing)

## Item 11 — "What's new" after an update

**Artifact claim:** "The hook already exists. `ReloadPrompt.tsx` knows when a new version lands. Show what changed instead of only offering a reload."

**Verdict:** PARTIALLY TRUE — the "knows when a new version lands" framing is wrong. `ReloadPrompt` knows a new _service-worker build_ is waiting, **before** reload (`src/app/ReloadPrompt.tsx:9-13`, `needRefresh` from `useRegisterSW`). It has no concept of app _version_ at all — no `__APP_VERSION__`, no version string anywhere in `src` (grepped, zero hits) or in `vite.config.ts` (no `define:` block at all). The reusable part is the PWA plumbing (`vite-plugin-pwa`'s `VitePWA({ registerType: 'prompt' })` config in `vite.config.ts`), not a version-aware hook.

**Verified baseline:**

- `package.json:4` `"version": "0.1.0"` — exists, not exposed to client build (no `import.meta.env.APP_VERSION`, no `define` in `vite.config.ts:8-56`).
- `ReloadPrompt.tsx` fires pre-reload, on the _old_ running bundle, when the new SW is installed-and-waiting. It has no post-boot / new-version-is-now-active signal.
- `src/db/index.ts`'s `db` table declaration — `settings: EntityTable<SettingRecord, 'key'>`, schema `'key'` only, unchanged across v1→v3. Any new key (`lastSeenVersion`) needs **no** Dexie version bump — same pattern as `ACTIVE_CHARACTER_KEY` in `src/stores/activeCharacter.ts:5,19,26` (plain non-`sync.` key, read/written directly).
- `docs/ARCHITECTURE.md:25-26`: external deps = `esi.evetech.net`, `login.eveonline.com`, `market.fuzzwork.co.uk`, Firebase. "Nothing else." No GitHub API today.

**Gap:**

1. No build-time version constant exposed to client code.
2. No release-notes content or delivery mechanism.
3. No "seen version" persistence.
4. No post-boot "what's new" component — only the pre-reload SW toast exists.

**Engine vs UI split:** Nothing belongs in `src/engine` — this is pure app-shell chrome (no calculation/logic to TDD). A tiny pure helper (`hasNewNotes(lastSeen: string, current: string): boolean`, plain string compare) could live in `src/app/whatsNew.ts` and would still be worth a unit test even though it's not `engine` — it's app-shell logic per CLAUDE.md's "TDD for all calculation/logic modules," and this qualifies as logic even if it's small.

**Files touched:**

- `vite.config.ts:8` — add `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` (read `package.json` version via `node:fs`/import assertion at config time).
- `src/vite-env.d.ts` (or wherever ambient types live — check for existing `.d.ts`; if none, add one) — declare `const __APP_VERSION__: string`.
- `src/app/App.tsx` — mount the new `WhatsNewPanel` alongside `ReloadPrompt`.
- `src/i18n/locales/en.json` — new keys (chrome only, see i18n section below).

**New modules:**

- `src/app/changelog.json` (or `.ts` exporting a typed array) — `{ version: string; date: string; items: string[] }[]`, hand-maintained, one entry appended per release.
- `src/app/WhatsNewPanel.tsx` — reads `__APP_VERSION__`, compares to stored `lastSeenVersion`, renders the newest entry (or entries since last seen) once, writes `lastSeenVersion` on dismiss/view.
- `src/app/whatsNew.ts` — pure compare/select logic (which changelog entries are "new" given last-seen version), unit-tested.

**Shared primitives needed:** None new — reuses `Panel`/`Button` from `src/components/ui`. No `DataTable`/`CharacterAvatar` involved (not ESI-derived, no `DataAgeBadge` — this isn't API-derived data).

**Design tokens/components used:** `Panel` (title + content) or a toast styled like `ReloadPrompt`'s (`fixed`, `rounded-xs`, `border-line-bright`, `bg-panel-2`, `shadow-lg`) for consistency — recommend a modal/panel instead of a corner toast since release notes are read-length content, not a one-line status; still `rounded-xs`, `border-line`, one primary "Got it" button (view rule: one primary button per view — this panel is modal-like so it's its own "view"). Uppercase micro-heading for the "What's new in vX.Y.Z" title per DESIGN.md §2.

**Tests:**

- `src/app/whatsNew.test.ts` — TDD: given `lastSeenVersion` and `changelog`, returns correct new-entries slice; handles "never seen" (first install → show nothing, or show latest — decide: recommend showing nothing on true first install, since a brand-new user has no "what changed" context; only show when `lastSeenVersion` existed and differs from current).
- `src/app/WhatsNewPanel.test.tsx` — renders when version changed and entries exist, does not render when already seen, writes setting on dismiss (mock `db.settings`, pattern per `ReloadPrompt.test.tsx`'s `vi.mock` style).
- No e2e needed (no ESI involved); could add a light Playwright check but low value — skip unless orchestrator wants shell coverage.

**i18n keys:** Chrome only, content stays out of the catalog (see reasoning below):

- `whatsNew.title` ("What's new")
- `whatsNew.dismiss` ("Got it")
- `whatsNew.viewAll` (optional link/expand label, if a full history view is added — otherwise omit)

Release-note **content** (the actual changelog bullet text) should NOT go through i18next. CLAUDE.md's i18n rule targets UI chrome/strings the app itself authors as interface; changelog entries are append-only editorial content, one array per release, that will never be translated in practice (English-only catalog today, per `CONTEXT.md` round 2) and would bloat `en.json` with dead keys for old versions nobody will see again (every past release's notes become permanently new i18n keys with no removal path since old keys can't be safely deleted while some user's `lastSeenVersion` might reference them... except it can't, since notes are keyed by version content not id — bloat is the concrete cost). Treat `changelog.json` as content, `WhatsNewPanel`'s chrome (title/buttons) as i18next. This is a scoped exception, not a rule violation — call it out explicitly to the orchestrator since CLAUDE.md is unconditional on its face.

**Sync / Dexie impact:** `lastSeenVersion` is a **local, non-`sync.`-prefixed** `db.settings` key — no schema bump (per `db/index.ts` analysis above). Argument for local-only: `src/sync/planSync.ts`'s `isSyncedSettingKey` and `setSyncedSetting` (**throws** if the key isn't `sync.`-prefixed) show the codebase already treats "which settings sync" as an explicit allowlist, not a default. `lastSeenVersion` is quintessential device state — device A reloading to the new build and dismissing the panel must not suppress the notes on device B, which may still be on the old build for hours/days. Sync would actively cause a user to miss release notes on their other device. Use the plain-key pattern (`stores/activeCharacter.ts:5,19,26`), not `setSyncedSetting`.

**New ESI scopes:** None.

**Cost:** S confirmed. It's a small, self-contained shell feature: one `define`, one JSON file, two small components, no ESI/Dexie schema work. Main variable cost is how much changelog-maintenance discipline the team commits to (an unmaintained changelog is worse than none) — that's a process cost, not an engineering one.

**Depends on:** None. Independent of items 09/18.

**Risks / open questions:**

- Who writes `changelog.json` per release, and is it enforced (CI check that a release PR touches it)? Not this ticket's problem to solve, but flag it — an empty/stale changelog undermines the whole feature.
- Decide "show nothing on fresh install" vs "show latest" for first-ever boot (recommended: nothing — no prior context to compare against).
- Fetching GitHub Releases at runtime was considered and rejected: adds `api.github.com` as a new external dependency not in `docs/ARCHITECTURE.md:25-26`'s closed list, and requires a Markdown renderer (new dep) or hand-rolled Markdown-to-JSX (fragile). Bundled JSON avoids both. If the orchestrator wants richer formatting later, structured JSON with a small set of block types (`paragraph`/`list`) still avoids a Markdown dependency.

---

## Item 18 — Font scaling and density

**Artifact claim:** "Cheaper for us than for them. Our tokens are already CSS custom properties — scale the root size. Accessibility win, not a cosmetic one."

**Verdict:** CONFIRMED for the Tailwind scale, with one significant caveat the teardown missed. Tailwind v4's default theme is `rem`-based: `node_modules/tailwindcss/theme.css:325` `--spacing: 0.25rem`, `:347-349` `--text-xs: 0.75rem`, `--text-sm: 0.875rem`, `:397` `--radius-xs: 0.125rem`. `docs/DESIGN.md`'s "control heights `h-7` (28px, compact) / `h-9` (36px, default)" description is the _computed_ value at the browser default 16px root — not a literal px value in the CSS. `src/styles/index.css`'s `@theme` block only overrides colors/fonts, leaving Tailwind's default rem spacing/text scale untouched. Grepped `src` for `h-[Npx]`/`w-[Npx]`/`size-[Npx]` arbitrary utilities: **zero matches**. So a root `html { font-size }` change _would_ scale every `h-7`/`h-9`/`text-xs`/`text-sm`/`rounded-xs` usage in the app proportionally. DESIGN.md's own description is the misleading artifact here, not the teardown's claim.

**The caveat that used to gate this (now resolved):** the teardown's mechanism depended on no literal-px arbitrary values surviving in the shared primitives. That sweep has since shipped: zero `text-[11px]`/`text-[10px]` sites remain anywhere in `src` (grepped), and `docs/DESIGN.md` §2 now documents the rem-based replacements (`text-[0.6875rem]` for the former 11px micro-headings) and states the rule explicitly — "Written in `rem`, never `px` — a literal `text-[11px]` would not scale with the root." Nothing left to convert.

Border widths (1px, not themed via a rem custom property in Tailwind v4 — no `--border-width` scale exists) correctly stay hairline-thin regardless of scale, which is desired per DESIGN.md §3 "always 1px" — that one's right by default, not a gap.

**Mechanism recommendation:** `--ui-scale` custom property (stored setting, e.g. `0.8`–`1.5`) applied as `html { font-size: calc(100% * var(--ui-scale)); }`. Every rem-based utility (spacing, text, radius) scales together automatically — no per-token multiplication needed, no `zoom`/`transform` (both have known problems: `zoom` is non-standard/Safari-only-recently and breaks fixed-position layering like the mobile bottom nav; CSS `transform: scale()` on a container doesn't reflow layout, causing overlap/clipping and breaking hit-target math for anything positioned outside the scaled box, e.g. `ReloadPrompt`'s `fixed` toast). Root-font-size is the only option that's both cheap and correct here, and with the px→rem sweep already done there's no remaining prerequisite — this item is now just the variable, the rule, and the slider.

**Verified baseline:** No existing font-scale setting, no `--ui-scale` variable, no per-user type-scale mechanism anywhere in `src/styles/index.css` or `docs/DESIGN.md`.

**Gap:** The `--ui-scale` variable, the settings UI (slider), and the persistence. (The px→rem sweep this used to depend on has already shipped — see above.)

**Engine vs UI split:** Nothing belongs in `src/engine` (no calculation — it's a CSS variable driven by a stored number). The clamp/validation of the slider value (e.g. clamp to 80–150, snap to 5% steps) is trivial enough to inline in the settings component; if the orchestrator wants it unit-tested in isolation, a tiny `src/app/fontScale.ts` (`clampScale(n): number`) is reasonable but arguably overkill for a `Math.min/max`.

**Files touched:**

- `src/styles/index.css` — add `--ui-scale: 1;` custom property (default) and the `html { font-size: calc(100% * var(--ui-scale)); }` rule.
- `src/routes/Settings.tsx` — currently deliberately empty (its own comment says the controls that belong here, including this one, "each ship with their own feature"); add the density-scale slider control to it. No new route needed — `Settings` is already wired at `/settings` in `App.tsx`.

**New modules:**

- The scale preference itself does not need a new hand-rolled store: `src/lib/useLocalSetting.ts` (`createLocalSetting`) already exists for exactly this shape — a device-local Dexie-backed value with an `onApply` hook for side effects on hydrate and on every set. Call it once at module scope, e.g. `createLocalSetting({ key: 'uiScale', defaultValue: 1, onApply: (v) => document.documentElement.style.setProperty('--ui-scale', String(v)) })`. No new Zustand store needs to be hand-written.

**Shared primitives needed:** None new — the "is a shared local-setting-with-live-apply hook worth extracting?" question this item used to raise is resolved: it shipped as `src/lib/useLocalSetting.ts`, `onApply` included, covering exactly this case. Use it directly.

**Design tokens/components used:** New `--ui-scale` custom property in `src/styles/index.css`'s existing `@theme`/`:root` structure; optionally new `--text-2xs`/`--text-3xs` tokens (formalizing what's currently ad hoc arbitrary values — arguably a design-system improvement independent of this feature). Styleguide (`src/routes/Styleguide.tsx`) is the natural manual-QA surface — see Tests below.

**Accessibility framing:** Native browser zoom (Ctrl+/Ctrl−) already scales the whole page including chrome, is OS/browser-integrated (persists per-site in most browsers), and requires no app code. An in-app slider adds: (1) a _visible, discoverable_ control inside a UI that many users won't know has browser zoom, (2) scoping only the app's own type/spacing scale rather than the whole viewport (arguably a smaller, less jarring change since it doesn't zoom the browser chrome/other tabs), (3) a stored _preference_ that survives across devices... except this brief recommends local-only persistence (see below), so cross-device isn't actually delivered. Given native zoom already covers the core use case, the in-app slider's marginal value is modest — mostly discoverability and a value that persists per-device without the user needing to know browser zoom exists. Still worth building (teardown's "accessibility win" framing holds), but it's an incremental convenience layer over an existing capability, not a capability gap. Currently the app does **not** actively fight user browser zoom (no `user-scalable=no`, no fixed viewport lock found) — worth a quick `index.html` check to confirm no `maximum-scale` lock exists before shipping (not verified in this pass — orchestrator/implementer should check `index.html`'s viewport meta tag). At 150%: fixed-height controls (`h-7`/`h-9`) scale in lockstep with their text (both rem-based, and now that the px→rem sweep is done, so do the former micro-heading arbitrary values) so clipping risk is low; dense tables (`px-3 py-1.5` cells, per DESIGN.md §3) at 150% will simply take more vertical space per row — expected, not broken, but worth a manual look at the densest views (Wallet/Assets/Orders tables) at max scale.

**Persistence:** Local (`db.settings`, non-`sync.` key), same argument as item 11 — this is a per-device display preference tied to _this screen's_ physical size/DPI/the user's eyesight at _this_ workstation, not Editable Data. Unlike `lastSeenVersion` this one is genuinely arguable (a user might reasonably want the same scale on every device), so flag it explicitly as the one the orchestrator could overrule to `sync.`-prefixed if cross-device consistency is valued over per-device physical-display correctness. Recommend local as the safer default; syncing is a one-line change later (`setSyncedSetting` instead of the plain key) if the orchestrator disagrees.

**Overlap with item 09 (density):** These are two distinct concepts and should stay that way. Font scale is a **global, accessibility-motivated** control over the type/spacing scale, applied at `html` level, affecting every view uniformly. Density (per item 09's brief, not read by me — inferred from this item's own description: "compact density mode for character cards") is a **per-view layout choice** about which fields render and how tight rows are, independent of font size. Recommend: **item 18 owns `--ui-scale` and the settings-store plumbing** (the mechanism); **item 09 owns compact-card layout** and may _read_ `--ui-scale`/the stored setting if it wants to respect it, but must not define a second competing scale variable or a second settings-persistence mechanism. If item 09's "density" turns out to just mean "smaller text," that's actually this item's feature and should be merged into it — orchestrator should confirm item 09's density is about field/row layout, not type size, before finalizing ownership.

**Tests:**

- Store behavior (defaults to `1`, setting persists to `db.settings` and updates state) is already covered generically wherever `useLocalSetting.ts` has its own tests — this item only needs to test clamping of out-of-range input (e.g. `setValue(300)` → clamps to 150 max), which stays this item's own concern whether it lives in the slider component or a tiny wrapper.
- Component test for the settings slider: renders current value, calls the store's `setValue` on change, live-updates `document.documentElement.style` (can assert via `getComputedStyle` or by checking the property was set — jsdom supports `style.getPropertyValue`).
- `src/routes/Styleguide.tsx` — recommend adding the scale control (or at least a read of `--ui-scale`) to the Styleguide page itself, or a query-param override (`?scale=1.5`), as the manual visual-regression check: render every token/component section at 150% to catch clipping. This is exactly the right home for it per `docs/DESIGN.md:9`, "Live reference: hidden `/styleguide` route" — extend it rather than building a separate scale-preview page.
- No unit test can meaningfully assert "nothing clips visually" — that's inherently a manual/visual check via Styleguide at max scale, not something worth faking with a snapshot test.

**i18n keys:**

- `settings.fontScale.label` ("Text size")
- `settings.fontScale.hint` (short description, e.g. "Scales all text and controls (80–150%)")
- (Reuses existing `common.*` keys if `src/routes/Settings.tsx` already has save/reset labels by the time this lands — check its current contents; today it only has `settings.title`/`settings.emptyTitle`/`settings.emptyHint`.)

**Sync / Dexie impact:** Local-only key, no schema bump (same `settings: EntityTable<SettingRecord, 'key'>` table in `src/db/index.ts`, unchanged since v1). If the orchestrator later wants sync, it's additive at the _settings_ level (no Dexie version bump either way, since arbitrary keys don't require one) — just swap `db.settings.put` for `setSyncedSetting` and prefix the key `sync.fontScale`.

**New ESI scopes:** None.

**Cost:** S confirmed. The px→rem sweep this used to be conditional on has already shipped, and `src/routes/Settings.tsx` already exists and is routed — it just needs this slider added to it. What's left is the `--ui-scale` variable, wiring it through `useLocalSetting`, and the slider control itself.

**Depends on:** None blocking. Coordinate with item 09 per the ownership split above (item 09 should not start a competing scale mechanism).

**Risks / open questions:**

- `Settings.tsx` is deliberately empty today (its own comment defers to the features that will populate it) — confirm this item is the one adding the first real control there, or coordinate with whichever other item gets there first, so the page's layout convention is established once.
- Confirm `index.html`'s viewport meta doesn't block browser zoom (quick check, not done in this pass).
- Decide whether `--text-2xs`/`--text-3xs` become official DESIGN.md tokens (recommended — turns an ad hoc arbitrary-value pattern into a documented one, small doc update to `docs/DESIGN.md` §2 table) or stay as inline rem literals.
- Verify item 09's "density" scope with its author before finalizing the ownership split above.
