# 0022 — Tiptap for the mail body editor

## Status

Accepted (2026-10-16)

## Context

New Mail, Reply and Forward need a WYSIWYG body editor (bold, italic,
underline, size, colour, links, tables) whose output is EVE markup, used mainly
on a phone with a soft keyboard. Soft keyboards (autocorrect, predictive text,
IME composition) are the part of rich text editing that is hardest to get
right; a hand-rolled `contenteditable` over our `MarkupNode` tree would own all
of it. The scope decision is `docs/context/decisions/20261016-124635-mail-compose-format-bar-and-eve-markup.md`.

## Decision

Use **Tiptap v3** (`@tiptap/react`, `@tiptap/core`, `@tiptap/pm`) with
individual extensions, not StarterKit: document, paragraph, text, hard break,
bold, italic, underline, link, table/row/header/cell (plain-text cells), gapcursor
and undo/redo, plus two small custom marks (EVE colour and size). Headings,
lists, images and code are not in the schema, so they cannot arrive by paste.

`src/engine/mail/mail/eveMarkup.ts` remains the **single authority for what is sent**.
`src/engine/mail/mail/mailEditorDoc.ts` converts the editor's JSON to and from
`MarkupNode`s and always passes through `parseEveMarkup` /
`serializeEveMarkup`; the schema is a convenience for editing, not the safety
boundary. Tiptap's markdown input and paste rules for bold and italic are
disabled so typed `**x**` stays literal.

The editor is loaded with `React.lazy` from `MailBodyEditor.tsx`: the Mail page
and every other route pay nothing until a composer opens.

## Alternatives

- **Hand-rolled `contenteditable`.** Smallest bundle, but we would own
  selection mapping, IME composition, autocorrect replacement and Android's
  `beforeinput` quirks, the exact things the primary (mobile) use hits first.
  Rejected.
- **Lexical.** Good React integration and mobile support, but its table and
  custom-mark model needs more glue for our schema, and ProseMirror's
  schema-validated paste (HTML in, only the allowed nodes and marks out) is
  the property we rely on most. Rejected, not for quality.

## Consequences

- New dependencies (all MIT): `@tiptap/{core,pm,react}` and the extensions
  above. ProseMirror ships as the `@tiptap/pm` re-export of `prosemirror-*`.
- **Bundle cost**, from the packages as installed (not a build; CLAUDE.md
  forbids running `npm run build` locally, so CI is the gate and the real
  chunk size appears in its build output). Gzip of the unminified entry files:
  `@tiptap/core` ~70 KB, `@tiptap/react` ~12 KB, `extension-table` ~8 KB;
  ProseMirror view ~61 KB, model ~30 KB, tables ~21 KB, transform ~20 KB,
  state ~9 KB, others under 8 KB each. Tree-shaking and minification
  should land the lazy chunk well under that sum; it is outside the entry chunk
  and the route chunks either way.
- Chunk isolation: the only static importers of `mailEditor/*` are tests;
  `MailBodyEditor.tsx` reaches it through `lazy(() => import(...))`.
- Every `@tiptap/*` package is pinned to the exact same version (`3.32.0`) on purpose: they are released in lockstep, mixing versions breaks the shared `@tiptap/core` types and extension API. Bump them all together.
- Upgrading Tiptap is a deliberate step: the custom marks and the markdown rule
  overrides depend on its extension API.
