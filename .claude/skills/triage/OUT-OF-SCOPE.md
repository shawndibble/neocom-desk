# Out-of-Scope Knowledge Base

The `.out-of-scope/` directory stores persistent records of rejected feature requests. Two purposes:

1. **Institutional memory**: why a feature was rejected, so the reasoning isn't lost when the issue is closed.
2. **Deduplication**: when a new issue matches a prior rejection, surface the previous decision instead of re-litigating it.

## Directory structure

```
.out-of-scope/
├── dark-mode.md
├── plugin-system.md
└── graphql-api.md
```

One file per **concept**, not per issue. Multiple issues requesting the same thing are grouped under one file.

## File format

Written like a short design document, not a database entry — paragraphs, code samples, examples.

```markdown
# Dark Mode

This project does not support dark mode or user-facing theming.

## Why this is out of scope

The rendering pipeline assumes a single palette defined in `ThemeConfig`.
Supporting multiple themes would require a theme context provider wrapping the
whole tree, per-component theme-aware style resolution, and a persistence layer
for user preferences. That's a significant architectural change that doesn't
align with the project's focus.

## Prior requests

- #42: "Add dark mode support"
- #87: "Night theme for accessibility"
```

### Naming the file

Short kebab-case concept name: `dark-mode.md`, `plugin-system.md`. Recognizable without opening.

### Writing the reason

Substantive and durable: reference project scope/philosophy, technical constraints, or strategic decisions. Avoid temporary circumstances ("we're too busy right now") — those are deferrals, not rejections.

## When to check

During triage step 1 (gather context), read all files in `.out-of-scope/`. Match by concept similarity, not keyword ("night theme" matches `dark-mode.md`). On a match, surface it: "This is similar to `.out-of-scope/dark-mode.md`. We rejected this before because [reason]."

## When to write

Only when an **enhancement** (not a bug) is _rejected_ as `wontfix`. Do **not** write here when something is closed as `wontfix` because it's **already implemented** — that would poison the dedup checks with false rejections; the closing comment points to where the feature already lives instead.

The flow: decide out of scope → check for an existing file → append to "Prior requests" or create a new file with concept, reason, first request → comment on the issue linking the file → close with `wontfix`.

## Updating or removing

If the maintainer reconsiders: delete the `.out-of-scope/` file. Old issues stay closed as historical records; the new issue that triggered reconsideration proceeds through normal triage.
