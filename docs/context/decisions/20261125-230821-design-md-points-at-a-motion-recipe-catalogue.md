# Scope decisions — DESIGN.md points at a motion recipe catalogue, and ships nothing from it

_Recorded 2026-11-25._

- **§6c's motion section names `transitions.dev` as a place to read before inventing a cue.** It
  is a catalogue of copy-paste transition recipes, and several are the house-shaped version of
  something this app has or wants: toast open/close, banners stacking, a number change that
  cross-fades only the digits that moved, accordion height, a tab pill indicator, a spinner that
  morphs into a drawn check. The Compare drawer's slide-off on a committed pull is the first thing
  taken from it.
- **Nothing from it is a dependency, and the tokens still win.** The entry says so explicitly,
  because the failure mode is an agent pasting a recipe whole and bringing its durations and
  easings with it. A recipe is read for the idea and rebuilt on `--motion-quick` /
  `--motion-medium` / `--motion-slow` and the two easings; §6c's own rule that durations are tuned
  in `index.css` is unchanged.
- **The site's `transitions-agent` CLI is deliberately not endorsed in DESIGN.md.** It scores an
  app's motion and offers to apply fixes, and an unpinned `npx` tool pointed at this codebase is
  not something a design doc can stand behind: it has not read §6c, so it reads a deliberate
  absence — no exit animation on an overlay, nothing at all under reduced motion — as a defect, and
  a standards entry that has to spend four lines warning agents off its own recommendation does not
  belong there. Run it by hand if you want a second opinion; never let it open a PR.
- **Counts and catalogue size stay out of the doc.** An earlier draft quoted the number of recipes
  and its dependency count. Nothing in this repo pins or checks either, so they are facts that rot
  silently in a standards doc; the author, the licence and what the catalogue is for are enough to
  find it.
