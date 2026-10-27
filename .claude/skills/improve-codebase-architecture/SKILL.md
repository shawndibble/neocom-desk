---
name: improve-codebase-architecture
description: Scan Neocom Desk for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick. Local copy of the mattpocock-skills skill with repo conventions and anti-god-file guardrails.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability, **without** producing god files that are harder for humans to maintain.

This is a local copy of the `mattpocock-skills` skill. It differs mainly in the repo's glossary and decision locations, the **Guardrails** section below, the PI exclusion and the read-only sub-agent rule. Everything in Guardrails is mandatory, in the report and in the grilling loop.

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Call the Skill tool with "mattpocock-skills:codebase-design" for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion, and don't drift into "component," "service," "API," or "boundary."
- Domain language: `GLOSSARY.md` gives names to good seams. Don't read it whole: `grep -n -i "<term>" GLOSSARY.md`. Scope decisions live in `docs/context/decisions/`, ADRs in `docs/adr/`. This command must not re-litigate them. Architecture map: `docs/ARCHITECTURE.md`, read it first.

## Guardrails

**Depth is the ratio of behavior to interface size. It is not file size or line count.** A module with a big or leaky interface is shallow however much it contains. Every candidate must satisfy all of these:

1. **Small interface.** The deepened module exposes at most 5 exports (6 only with a stated reason). More means a bag of utilities, not a deep module: split it along a real seam or drop the candidate.
2. **Callers must get simpler.** Name the glue code, branching or duplicated knowledge that disappears from callers. If the change only moves code, drop it.
3. **No merging for its own sake.** Never collapse several shallow modules into one large file. Keep the implementation split into cohesive internal files behind one index, and import the module only through that index.
4. **Size ceiling.** Measure it: run `wc -l` on the files involved, read-only, never guess. Flag any resulting implementation file over ~400 lines, or a module over ~1,500 lines in total, and propose the split into two modules along a real seam. Reviewer-sized: one person must be able to review it in one sitting.
5. **One reason to change.** If the module's description needs "and", it is two modules.
6. **Real seams only.** A seam needs two real adapters (production plus test counts). One adapter is hypothetical: no new interface or indirection for it.
7. **Respect layering.** `src/engine` stays pure: no fetch, DOM or Dexie imports. Refresh tokens stay in Dexie only. Don't move logic across that line.
8. **Tests move up, not away.** Calculation and logic modules keep TDD. Name which tests survive at the new interface and which are deleted as redundant. Never propose a deepening that reduces coverage of behavior.
9. **UI work follows `docs/DESIGN.md`.** Don't deepen by re-implementing a `src/components/ui` primitive.

Each card carries a **Guardrail check** row: proposed export count, the callers that get simpler, the largest resulting file and module total, and the seam's two adapters, plus one line on guardrails 5, 7, 8 and 9 (one reason to change, layering, surviving tests, no re-implemented primitive). A card that can't fill it in is `Speculative` at best.

Run at most three agents at once, including any design-it-twice fan-out.

## Process

### 1. Explore

**Scope before you scan: YAGNI.** Deepening a module pays off by making future changes to it easier, so put extra weight on the parts of the codebase that have recently changed. Decide _where_ to look before you look:

- If the user named a direction (a module, a subsystem, a pain point), take it, and skip the inference below.
- Otherwise, walk back a good stretch of the commit history (`git fetch origin develop`, then `git log --oneline origin/develop`) to find the codebase's hot spots, the files and areas that keep coming up, and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net. Survey `origin/develop`, not a possibly stale working tree.

Read `docs/ARCHITECTURE.md`, grep `GLOSSARY.md` for the terms in the area, and read any ADRs and `docs/context/decisions/` entries touching it first.

Then spawn a sub-agent to walk the codebase. Don't follow rigid heuristics; explore organically and note where you experience friction. Sub-agents are read-only: they never run tests, lint, typecheck or build.

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow**, with an interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?
- Which existing files are already too large or have too many exports? These are anti-candidates for merging and candidates for splitting.

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to the scratchpad directory if the system prompt lists one, else `$TMPDIR` or `/tmp`, so nothing lands in the repo. Name it `architecture-review-<timestamp>.html` so each run gets a fresh file. Open it for the user (`xdg-open <path>` on Linux) and tell them the absolute path.

The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams where a graph/flow/sequence reliably communicates the structure. Mix Mermaid with hand-crafted CSS/SVG visuals: use Mermaid when relationships are graph-shaped (call graphs, dependencies, sequences), and hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual. The "after" diagram must show the interface as a small surface and the implementation as several internal files, never one big box.

For each candidate, render a card with:

- **Files**: which files/modules are involved
- **Problem**: why the current architecture is causing friction
- **Solution**: plain English description of what would change
- **Benefits**: explained in terms of locality and leverage, and how tests would improve
- **Before / After diagram**: side-by-side, custom-drawn, illustrating the shallowness and the deepening
- **Guardrail check**: see Guardrails
- **Recommendation strength**: one of `Strong`, `Worth exploring`, `Speculative`, rendered as a badge

End the report with a **Top recommendation** section: which candidate you'd tackle first and why. Also list **Split candidates**: existing god files or fat interfaces found during the survey, if any.

**Use GLOSSARY.md vocabulary for the domain, and the `/codebase-design` vocabulary for the architecture.** Use glossary terms exactly, not synonyms.

**ADR conflicts**: if a candidate contradicts an existing ADR or decision file, only surface it when the friction is real enough to warrant revisiting it. Mark it clearly in the card (e.g. a warning callout: _"contradicts ADR-0007, but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.

Do NOT propose interfaces yet. After the file is written, ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, call the Skill tool with "mattpocock-skills:grilling" to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive. Apply the Guardrails here too. Make no file edits in the main checkout: glossary and decision changes wait for the implementation worktree. State the export list and the internal file split explicitly, and get the user's approval of the interface before any code moves. If the interface grows past the 5-export cap during grilling, stop and split.

Side effects happen inline as decisions crystallize; call the Skill tool with "mattpocock-skills:domain-modeling" to keep the domain model current as you go (ignore its `CONTEXT.md` default: this repo uses `GLOSSARY.md`):

- **Naming a deepened module after a concept not in `GLOSSARY.md`?** Add the term to the glossary. **Never append a scope decision to it**: record those with `node scripts/new-decision.mjs "<title>" [--issue <n>]`, never numbered.
- **Sharpening a fuzzy term during the conversation?** Update `GLOSSARY.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR (numbered per the `docs/adr/` convention, see `docs/agents/domain.md`), framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing; skip ephemeral reasons ("not worth it right now") and self-evident ones.
- **Want to explore alternative interfaces for the deepened module?** Call the Skill tool with "mattpocock-skills:codebase-design" and use its design-it-twice parallel sub-agent pattern.

Implementation then follows the repo workflow: a worktree, TDD for logic, `npm run typecheck` and only the touched test files locally, `/code-review` before merge.
