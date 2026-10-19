# Not Found

One route outside `RequireCharacter`/`ScopeGate`, not in the nav: the `*` catch-all (`src/routes/NotFound.tsx`), declared in `src/app/App.tsx`. `NotFound` is eager. The design reference is Storybook ("Guides/Interaction grammar" story), not a route (#4139).

| Route                                | Purpose                                      | Auth |
| ------------------------------------ | -------------------------------------------- | ---- |
| `*` (NotFound)                       | Dead or mistyped URL screen with one way out | none |
| `/error` (sibling, `ErrorProbe.tsx`) | Undisclosed Sentry probe: throws on render   | none |

## Purpose and user goal

A pilot who followed a bad link: "This address is wrong; how do I get back in?"

- **Top job:** leave a dead URL with one button.
- **Device and cadence:** mostly the desktop, the app's primary device (owner, 2026-10-11), rarely.
- **Above the fold:** heading, one-line hint, Go to Neocom Desk.
- **Sources:** owner, 2026-10-11; `NotFound.tsx` header.
- **Unconfirmed:** none.

### Mobbin brief

- **Fit:** high.
- **Analog apps:** GitHub, Stripe, Notion (404 pages).
- **Screen queries:**
  - `web: page not found screen with a short message and one button back to the home page`
- **Flow queries:** none.

## NotFound (`*`)

- Replaces a silent `<Navigate to="/">` so a bad address is explained (`NotFound.tsx` header).
- Full-screen centered `<main>`: `LogoMark`, `<h1>` "Page not found", hint "That address does not match anything in Neocom Desk. The link may be wrong, or it may have pointed at something that has since moved.", `Link to="/"` "Go to Neocom Desk" (button), `ExternalLink` to Discord "Think this is a bug? Ask on Discord".
- Same shape as `ErrorScreen` (`src/app/ErrorBoundary.tsx`): the app has nothing to show and offers one way out. "Go to" goes via `/` -> `Root` (login / characters / overview by state).
- No login required, no data, no scopes.
- Legacy path redirects are handled earlier (`LegacyPathRedirect`, `legacyPaths.ts`), so only truly unmatched paths reach it. A Character-gated path with no Character goes to `/login` first, not NotFound.

## Persistence, scopes and states

Nothing persists. No ESI, no Dexie, no scopes, no URL state. Related docs: `docs/DESIGN.md`, `docs/ARCHITECTURE.md` (routing, gating).

## Decisions

No scope decision specific to NotFound or `/error`.

## Tests assert

- `NotFound.test.tsx`: "Page not found" heading and a link to `/` with the Neocom Desk name.
- `ErrorProbe.test.tsx`: rendering throws "Deliberate probe: /error route render throw".

## Observed gaps

- `NotFound` offers Home only; it does not echo the bad path or suggest the nearest route.
- `/error` throws deliberately in production (`ErrorProbe.tsx`) and is not documented for users.

## Interview Q&A

1. Why does NotFound exist? A silent redirect hid wrong addresses (`NotFound.tsx` header).
2. How does it relate to ErrorScreen? Same full-screen shape/one exit (`ErrorBoundary.tsx`).
3. What is `/error`? Deliberate render throw to verify Sentry capture (`ErrorProbe.tsx`).
4. Which routes can hit NotFound? Only unmatched paths; legacy redirects and gated routes resolve earlier (`App.tsx`).

## Improvement ideas

- NotFound: echo the path, link to Overview/Help, add noindex.
