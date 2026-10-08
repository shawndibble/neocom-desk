# Help and FAQ

Route `/help` (`src/routes/Help.tsx`), a footer-group page (`src/app/navDestinations.ts:257`; `mobileTab: false`, reached from the rail footer or the phone More sheet; UNGATED, `src/app/routeScopes.ts:81`). Three tabs from `HELP_TABS` (`src/app/pageTabs.ts:66`), one mounted page instance, tab in the URL path: `/help/shortcuts` (default, `/help` opens on it), `/help/faq`, `/help/support`. Legacy redirects (`src/app/legacyPaths.ts:11-13`): `/settings/shortcuts` -> `/help/shortcuts`, `/settings/faq` -> `/help/faq`, `/settings/help` -> `/help/support`. Help is not a setting (scope decision `20261002-145653-lp-store-under-market-pilot-lookup-its-own`; shortcuts moved here by `20261002-165816-shortcuts-move-to-help-always-on-and-lose`). Prose width `max-w-3xl`.

Command palette (`src/features/commandPalette`) is covered elsewhere; here only its link to Help: the `?` key and the palette's shortcuts command both land on `/help/shortcuts`.

| Tab       | Component                                            | Content                                                                |
| --------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Shortcuts | `src/features/help/ShortcutsPanel.tsx`               | Every key the app answers to, from the same array that dispatches them |
| FAQ       | `src/features/faq/FaqPanel.tsx` (+ `whatWeStore.ts`) | 8 collapsible questions; "what we store" commitments                   |
| Support   | `src/features/help/HelpPanel.tsx`                    | Discord, source, say thanks                                            |

## Shortcuts tab

Three panels, definition lists (two columns from `md`, one on phone), each row = description + `<kbd>`.

- "Keyboard shortcuts": first row "Open the command palette" with the chord (Cmd+K on Apple platforms via `isApplePlatform`, Ctrl K otherwise; `commandPaletteDisplayKey`; not a `SHORTCUTS` row, fires inside text fields). Then every `SHORTCUTS` entry (`src/lib/shortcuts.ts`): `C` switch character, `O` Overview, `M` Market, `I` Industry, `W` Wallet, `P` Planetary Industry, `A` Alerts, `T` Mining tax, `,` Settings, `?` show this list (allows Shift), `Esc` close the open dialog (native, no handler). Dispatch in `app/useKeyboardShortcuts.ts`. Single-key shortcuts are always on (no off switch).
- "On a page": "These work inside text boxes too. Every fitting edit is in the address bar, so your browser's Back button is undo." Rows: save fitting (Mod+S), save as new copy (Mod+Shift+S), submit a pasted list or fit (Mod+Enter, any paste box).
- "Paste anywhere": hint that outside a text field a pasted fit, skill plan or item list opens where it belongs; rows Paste (Cmd/Ctrl V), EFT fitting -> "Opens in Fittings", Item list -> "Opens in Appraisal", Skill plan -> "Opens in the Skills planner" (`app/GlobalPasteRouter.tsx`).

## FAQ tab

- Intro: "We store what you make in the app. What we read from EVE stays on this device."
- 8 `FaqItem` disclosures (`aria-expanded`, `aria-controls`; all closed; independent open state; question set body-size, `rowInteractiveClassName`):
  1. What syncs between my devices? (`WHAT_WE_STORE_GROUPS` "synced"): Skill Plans; Build Plans; Production Runs (with linked sales/orders); Market Quickbar; pinned stations/structures in Assets; PI resource picks; Moon Mining payees and assignments (incl. the ore and ISK snapshot); saved Fittings (name + share code); already-seen alerts (kept 30 days); synced preferences with sub-bullets (notifications, defaults, industry, market, skills incl. Alpha/Omega, fittings, PI and mining tax, layout incl. Overview cards and hidden nav pages, travel and Route Safety). Filed under each character's EVE ID, never a name or email.
  2. What stays on this device? ("local"): all ESI character data (assets, wallet, contracts, mail, contacts, clones, calendar, skills, queue, jobs, colonies); corporation data; market prices/books/LP stores; 90 days of mining ledger; the EVE login token (never leaves); display settings and remembered sorts/filters/sections; Ansiblex jump gate list.
  3. Does Neocom Desk change anything in EVE? The five writes (mail read flag, calendar response, mail send, Fitting save, autopilot waypoints). Text `settings.faq.store.notes.writes`.
  4. How do I delete my data? Settings > Data & storage > Delete all data (remote then device); Log out of all characters clears the device only; plus the removal note (removing a Character clears the device only; remote copy deleted after 90 days idle).
  5. How do I force an update? Settings > Data & storage > Update now (checks and reloads).
  6. What notifications arrive when the app is closed? Only alerts with a time known ahead (skill level done, training stopped/queue ending, industry job done, courier due, clone jump ready, PI extraction/expiry, calendar start, structure low fuel, EVE timers); everything else needs the app open; push stores token, character IDs and 72 h of alert text; turn on in Settings > Notifications.
  7. Do you collect crash reports? Error and page only; no IPs; no request/response bodies; EVE tokens stripped.
  8. How do backups work? Password-encrypted file incl. login tokens, written only on button press, saved where the pilot puts it, never seen by the app.
- Footer: link to `/privacy.html` ("Full details are in the Privacy Policy") and a link "Support" to `/help/support` ("Bug, question or idea?").
- `whatWeStore.ts` is a user-facing commitment: it must match `sync/syncedCollections.ts` (each declaration names its `faqItem`, so a mistyped id fails to compile), the `SYNCED_SETTING_KEYS` allow-list (`sync/syncedSettings.ts`) and Sentry config (`instrument.ts`). Decision `20260907-205018-what-we-store-the-faq-tab-as-a.md`.
- No status colours: "synced" vs "stays on this device" is said in words (DESIGN.md 6, 7).

## Support tab

Three `Panel`s of prose with `Trans` (links mid-sentence):

- "Bugs, ideas and chat": everything goes through Discord (`DISCORD_URL`, `ExternalLink`); hint to include steps and expected result.
- "Source code": open source on GitHub (`REPO_URL`), pull requests welcome; hint to report bugs/ideas on Discord, not GitHub.
- "Say thanks": in game "Mero Otichoda"; donations welcome, never expected; app stays free.

## Persistence, scopes and states

No ESI, no scope, no Dexie, no Firestore, no URL state beyond the tab path. Static strings (`settings.faq.*`, `settings.help.*`, `shortcuts.*` in `en.json`) plus the `SHORTCUTS` array. FAQ open/closed state is component-local (all closed on load). States: no loading/empty/error states. Mobile: lists collapse to one column. `docs/DESIGN.md` 6c governs link/disclosure styling; `public/privacy.html` and `public/data-credit.html` (login footer; privacy also from the FAQ) and `public/delete-data.html` are the other user-facing statements.

## Decisions

`docs/context/decisions/20261002-145653-lp-store-under-market-pilot-lookup-its-own.md` (Help is a page, not a setting), `20261002-165816-shortcuts-move-to-help-always-on-and-lose.md` (shortcuts here, always on, WCAG 2.1.4 cost accepted; supersedes `20260924-135633`), `20260907-205018-what-we-store-the-faq-tab-as-a.md`, `20260929-235256-command-palette-opens-by-shortcut-only.md`; ADR 0015 (tab is a path segment).

## Tests assert

- `HelpPanel.test.tsx`: Support has the "Bugs, ideas and chat" panel with a Discord link (`DISCORD_URL`, `target=_blank`, `rel` has `noopener`); "Source code" links `REPO_URL` the same way and says report bugs and ideas on Discord not GitHub; "Say thanks" names Mero Otichoda and says donations are "never expected".
- `FaqPanel.test.tsx` ("What We Store"): every synced collection in the registry maps to an existing FAQ line and every synced line maps to a collection; synced lines keep their reading order; every synced setting key has words in the FAQ; questions render closed (`aria-expanded=false`), exact question count, delete and update questions exist; opening renders every group and line once; how-to answers say where to go ("press Update now", push kinds text); exactly two groups and no group listing things we do not hold; states the cases where something leaves the device (push, crash reports, writes to EVE); says when a removed character's synced copy leaves our servers; does not claim EVE data is uploaded; points to the Help Support tab.
- `legacyPaths.test.ts`: `/settings/faq` -> `/help/faq`, `/settings/help` -> `/help/support`; unknown paths and prefix-only matches are left alone.

## Observed gaps

- FAQ does not name Characters-page groups or stars (device-local, user-created) or the Customize-permissions selection; "preferences" line only covers display settings and remembered sorts/filters/sections. `whatWeStore.ts` has no entry for them.
- `ShortcutDef.descriptionKey` doc still says "shown in the Settings shortcut list" (`src/lib/shortcuts.ts:136`); the list moved to Help.
- Single-character shortcuts cannot be turned off (decision `20261002-165816` records the WCAG 2.1.4 cost).
- Shortcut list is static (rendered from the `SHORTCUTS` array, no per-context filtering); the only page-level shortcuts documented are the three "On a page" rows (Mod+S and Mod+Shift+S are Fittings-only).
- No search or anchor links within FAQ; open state is local (not in URL), so a specific answer cannot be linked (only the tab: `/help/faq`).
- Support tab has no in-app bug-report form, version/build number or diagnostics copy; Discord only.
- No Help entry for per-page behaviour (e.g. what a card or column means); only InfoTooltips on individual surfaces.

## Interview Q&A

1. Where do Help tabs live in the URL? `/help/shortcuts|faq|support`, one page instance (`pageTabs.ts:66`); legacy `/settings/*` redirect (`legacyPaths.ts`).
2. Why is Help separate from Settings? Help is not a setting (decision `20261002-145653`); shortcuts moved here (`20261002-165816`).
3. Are shortcuts configurable? No; always on; known WCAG 2.1.4 cost recorded in the decision.
4. How is the FAQ kept honest? `whatWeStore.ts` mirrors `syncedCollections.ts` (typed `faqItem`), `SYNCED_SETTING_KEYS` and Sentry config; decision `20260907-205018`.
5. What syncs vs stays local? See FAQ answers 1-2 above; ESI data and tokens never sync.
6. What does the app write to EVE? Five writes listed in FAQ 3 and on Login.
7. How do you delete data? Settings > Data & storage; remote purge then device wipe; removal leaves remote 90 days.
8. What reaches us from a push device? Token, character IDs, next 72 h of alert text.
9. How do you get an update now? Settings > Data & storage > Update now.
10. Which shortcut opens the palette? Cmd/Ctrl+K (works in text fields); `?` opens Shortcuts.

## Improvement ideas

- Add FAQ entries for groups/stars and Customize permissions storage.
- Deep-linkable FAQ items; search; build/version number on Support.
- Per-page contextual help.
