# Styleguide and Not Found

Two routes outside `RequireCharacter`/`ScopeGate`, neither in the nav: `/styleguide` (`src/routes/Styleguide.tsx`) and the `*` catch-all (`src/routes/NotFound.tsx`). Both declared at `src/app/App.tsx:360,373`. Lazy `Suspense` fallback `RouteFallback` for `/styleguide`; `NotFound` is eager.

| Route                                | Purpose                                                                                | Auth                   |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------- |
| `/styleguide`                        | Hidden live reference of design tokens, base components and the 6c interaction grammar | none; no ESI, no Dexie |
| `*` (NotFound)                       | Dead or mistyped URL screen with one way out                                           | none                   |
| `/error` (sibling, `ErrorProbe.tsx`) | Undisclosed Sentry probe: throws on render                                             | none                   |

## Styleguide (`/styleguide`)

- Not linked from nav, command palette or Settings; reached by URL only. `documentTitle.ts` maps it to an empty title list (`:78`); `pagePathFor.ts` treats it as a static route for analytics. Source of truth for what it shows: `docs/DESIGN.md` (its header says so; DESIGN.md line 9: add a new 6c cue here in the same PR).
- Also used as a stable no-login page by built-app e2e specs (`e2e/offlineServiceWorker.built.spec.ts`, `e2e/productionCss.built.spec.ts`).
- Layout: `min-h-screen`, `space-y-10`, `PageHeader` "Neocom Desk Styleguide" and a dim intro line; vertical stack of `Section` blocks (micro-heading + content). No tabs, no navigation, no search.
- Sections (`Styleguide.tsx`):
  1. Color tokens: 16 swatches (`bg`, `panel`, `panel-2`, `line`, `line-bright`, `text`, `text-dim`, `text-faint` decorative only, `accent`, `accent-dim` not for text, `accent-contrast` text on accent, `success`, `warning`, `danger`, `isk-pos`, `isk-neg`).
  2. Typography: page title 20px semibold, micro-heading 12px uppercase widest, body 14px, secondary text-dim, tabular numbers with ISK pos/neg.
  3. Panel: titled, with actions (`DataAgeBadge` + Button), flush (`padded={false}`).
  4. Button: primary / ghost / danger x enabled / disabled / small.
  5. StatChip: tones and `StatChips` row.
  6. DataAgeBadge: fresh, minutes, hours, days.
  7. Tabs (`Tabs` with local state).
  8. EmptyState.
  9. LogoMark, Spinner.
  10. DataTable (sample rows with ISK tone) and DataTable wide (stacks below `sm`).
  11. CharacterAvatar (sample id `90000001`, resolves against the image server).
  12. FilterChip, FilterBar (search, ref-type `Select`, unread chip).
  13. Context menu (items, disabled, separator, submenu), Dropdown menu.
  14. Fields: one scale, two sizes (`TextInput`, `NativeSelect`, `Select` with separators, Button, IconButton, `SearchInput` always md with magnifier).
  15. Interaction grammar (6c): `src/routes/styleguide/InteractionGrammar.tsx`, the only section that uses i18n (`styleguide.interactionGrammar.*`). Groups: Links (accent text, inline link, text action, external link), Explain and edit (hint text, info tooltip, info button, pencil, `IskAmount`), Carets and openers (row caret, disclosure caret, field caret, pending hourglass, pager carets, dialog opener `...`), Menus and rows (row menu with >= 2 actions, selected-row accent border), States (rest, hover/pressed, focus-visible, disabled, loading, selected/on). Each `Cue` shows the 6c rule name above the real component.
- Interactions are samples only (local state in `Tabs`, `FilterChip`, `FilterBar`, region `Select`); nothing persists.
- Mobile: single column; wide table sample demonstrates the `.dt-stack` collapse.

## NotFound (`*`)

- Replaces a silent `<Navigate to="/">` so a bad address is explained (`NotFound.tsx` header).
- Full-screen centered `<main>`: `LogoMark`, `<h1>` "Page not found", hint "That address does not match anything in Neocom Desk. The link may be wrong, or it may have pointed at something that has since moved.", `Link to="/"` "Go to Neocom Desk" (button), `ExternalLink` to Discord "Think this is a bug? Ask on Discord".
- Same shape as `ErrorScreen` (`src/app/ErrorBoundary.tsx`): the app has nothing to show and offers one way out. "Go to" goes via `/` -> `Root` (login / characters / overview by state).
- No login required, no data, no scopes.
- Legacy path redirects are handled earlier (`LegacyPathRedirect`, `legacyPaths.ts`), so only truly unmatched paths reach it. A Character-gated path with no Character goes to `/login` first, not NotFound.

## Persistence, scopes and states

Nothing persists (sample state is local to `Tabs`, `FilterChip`, `FilterBar`, region `Select`). No ESI, no Dexie, no scopes, no URL state. No loading/empty/error states except the samples themselves. Related docs: `docs/DESIGN.md` (tokens, primitives, 6c grammar), `docs/ARCHITECTURE.md` (routing, gating).

## Decisions

`docs/DESIGN.md` 6c; ADR 0017 (DataTable stacks by class) shown by the wide-table sample; ADR 0004 (Radix for menu primitives) behind the menu samples. No scope decision specific to NotFound or `/error`.

## Tests assert

- `InteractionGrammar.test.tsx`: each cue group heading renders; more than 20 rule names each appear; the external link opens in a new tab; entity link has an href; a loading Button labelled Saving has `aria-busy="true"`; a row button is present and a selected row carries `aria-current="true"`.
- `NotFound.test.tsx`: "Page not found" heading and a link to `/` with the Neocom Desk name.
- `ErrorProbe.test.tsx`: rendering throws "Deliberate probe: /error route render throw".

## Observed gaps

- `Styleguide.tsx` hard-codes English strings in every section title, label and sample (only the interaction-grammar section uses i18n), against the project rule that all UI strings go through i18next.
- No discoverable entry point (no nav item, palette command or link).
- Section list is hand-maintained; a new `src/components/ui` primitive has no test or lint that fails if it is missing from `/styleguide` (only the 6c cues are called out in DESIGN.md).
- Page has no `noindex` handling visible in `index.html` and is publicly reachable on the deployed site.
- `NotFound` offers Home only; it does not echo the bad path or suggest the nearest route.
- `/error` throws deliberately in production (`ErrorProbe.tsx`) and is not documented for users.

## Interview Q&A

1. What is `/styleguide` for? Live reference of tokens/primitives and the 6c grammar; DESIGN.md says add a cue there with its rule.
2. Why is it outside RequireCharacter? It needs no data; e2e built specs use it as an auth-free page (`e2e/offlineServiceWorker.built.spec.ts`, `productionCss.built.spec.ts`).
3. Why does NotFound exist? A silent redirect hid wrong addresses (`NotFound.tsx` header).
4. How does it relate to ErrorScreen? Same full-screen shape/one exit (`ErrorBoundary.tsx`).
5. What is `/error`? Deliberate render throw to verify Sentry capture (`ErrorProbe.tsx`).
6. Which routes can hit NotFound? Only unmatched paths; legacy redirects and gated routes resolve earlier (`App.tsx`).
7. Is the styleguide localized? Only the grammar section (`styleguide.interactionGrammar.*`).

## Improvement ideas

- Localize the styleguide; add a check that every `components/ui` export appears there.
- NotFound: echo the path, link to Overview/Help, add noindex.
