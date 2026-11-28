# Scope decisions — Overview phone header: bell in the corner, Next as a row, scope above the widgets

_Recorded 2026-11-28. Supersedes the control-line layout in `20261125-204751`; its ⋮ contents, Next-as-borderless-row and "the portrait does not open the scope picker" still hold._

- **Below `md` the bell sits in the header's top-right corner, with the ⋮ directly under it.** The bell is a global notification and the ⋮ is a page action, so neither belongs in a row of page controls. They share one column beside the name and the affiliations. From `md` the header is unchanged.
- **Corporation and alliance share one wrapping line**, separated by ` · `, still entity links (DESIGN.md §6c). The Achievement line (title and points) stays on its own line under them.
- **Next is a full-width row under the identity block**, with a hairline above it, the countdown first, the note after it and a trailing GoTo chevron. It no longer shares a line with the ⋮ and the bell.
- **The scope picker leaves the header on a phone and sits above the widgets.** It sets every widget's scope, so it belongs with the widgets it changes. It stays in the header from `md` up.
