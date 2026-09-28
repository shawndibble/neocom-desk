# Scope decisions — signed-in shell is lazy, preloaded at boot for returning users

_Recorded 2026-09-28._

- **`Layout` and `Overview` are code-split, reversing their deliberate
  eagerness.** They were static in `App.tsx` so a returning user's cold load
  never showed a Suspense fallback frame. The cost was that every signed-out
  visitor on /login downloaded the whole signed-in shell: statically reachable
  only through those two were 156 of the entry's 362 app modules (~1.14 MB of
  ~2.21 MB source), including the notification pollers, corp gating and
  `@dnd-kit/sortable`.

- **Returning users still get no extra frame in practice.** A synchronous
  localStorage hint (`signedInShellHint.ts`, kept in step with
  `db.characters` by `App`) lets `bootShellPreload.ts`, imported second in
  `main.tsx`, start both chunks while the entry is still evaluating. They
  race `RequireCharacter`'s Dexie read, and `preloadedLazy` renders the shell
  outright once loaded instead of suspending for a tick. The SSO callback
  preloads too, since a first sign-in has no hint yet. If the chunk is still
  missing, the fallback is the same `BootScreen` the gate was just showing,
  so the hand-off does not jump.

- **The hint only steers a preload, never a route.** A stale `true` costs one
  unneeded fetch and a missing one costs one fallback frame. Routing still
  waits on Dexie. `bootImportGraph.test.ts` guards that neither module comes
  back into the entry's static graph.
