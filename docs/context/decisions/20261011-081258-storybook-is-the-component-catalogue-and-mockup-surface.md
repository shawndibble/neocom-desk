# Scope decisions — Storybook is the component catalogue and mockup surface (issue #3551)

_Recorded 2026-10-11 · issue #3551._

- **Storybook is the component catalogue and the surface mockups are built on.** Mockups drifted from the app because agents re-drew components as hand-written HTML; a story renders the real `src/components/ui` primitive with the app's own Vite config, Tailwind tokens and global CSS, so it cannot drift.
- **Stories live beside their component** as `<Component>.stories.tsx`, one concept per story, with a JSDoc `@summary` on the component, its key props and each story. Shared decorators (i18next, router, the dark backdrop) are in `.storybook/preview.tsx`.
- **`npm run storybook` (`scripts/storybook.mjs`) picks a free port itself** and prints the URL, because each worktree serves only its own code and 5173 belongs to the app. The components manifest (`/manifests/components.json`) is on for the agent CLI.
- **Stories run as tests in the existing `dom` Vitest project** (`src/storybook/smoke/*.test.tsx`, via `composeStories`), so the CI `test` shards cover them and no new required check exists. `@storybook/addon-vitest` (browser mode) is deliberately not used: it needs a second Vitest project and a browser install in every shard.
- **Unattended agents use npm scripts, not the Storybook MCP.** `@storybook/addon-mcp` exists only while `storybook dev` runs and headless `claude -p` does not reconnect a server that was down at start; MCP stays an extra for interactive sessions. A static `storybook build` is never run locally.
