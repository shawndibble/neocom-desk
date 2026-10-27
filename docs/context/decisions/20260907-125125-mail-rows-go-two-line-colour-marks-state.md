# Scope decisions — Mail rows go two-line; colour marks state, glyphs mark folder

_Recorded 2026-09-07._

- **The one-line mail row is reversed** (round 18,
  `20260901-172427-mail-page-rebuild.md`: "sender, subject, received date and
  System Label tag all render on a single line"). That decision named the
  problem itself — "sender + subject + tag already compete hard for ~340px" —
  and answered it by dropping the date on narrow screens. It wasn't enough:
  the sender was clamped to `w-20` (80px) and the subject got whatever four
  competing fields left, so **the two fields that identify a mail were the
  two that truncated first**. The row is now **subject on line 1, folder
  glyph + party + date on line 2** — the title-over-detail shape `CorpBoardRow`
  and `DataTable`'s stacked card already ship.
  - The subject **wraps** (`line-clamp-2`) instead of truncating; the party
    truncates instead. A clipped subject was the complaint; a name is
    recognised from its first few characters.
  - Round 18's "narrow screens drop the date" goes with it — on two lines the
    date fits at 390px.
  - The cost is honest and accepted: a row is ~50px instead of ~32px, so the
    list's flat cap rises from `32rem` to `36rem` (`44rem` on `lg`) to keep
    roughly the same number of mails on screen.
  - The list column widens `20rem` → `22rem` (`24rem` at `xl`). Secondary:
    20rem was never the real problem. 24rem at `lg` would squeeze the reading
    pane under ~600px inside `max-w-6xl`.

- **Colour marks state; a glyph marks the folder. No per-folder hue.** The
  obvious move — four colours for Inbox/Sent/Corp/Alliance — is refused.
  Every colour scale in this app is ordinal or semantic:
  `securityStatusColor` (a position on a numeric scale, rendered with its
  number), `STANDING_TONE`, the order-problem severity ladder. The four
  folders are a **nominal** set: no order, no severity, no magnitude. A hue
  there encodes identity alone, which is what DESIGN.md §6 means by
  decoration — and in a palette where cyan already means "interactive" and
  green/amber/red already mean status, four new hues would read as status and
  read wrong. It would also make this the app's first nominal palette, which
  the next categorical set (contract types, notification kinds) would then
  either reuse wrongly or fork.
  - The folder gains a glyph (`Icon.MailInbox` / `MailSent` / `Corporation` /
    `MailAlliance`) **beside its name, not instead of it**. Dropping the name
    for a bare glyph was tried and reversed: DESIGN.md §5 blesses a decorative
    icon only "beside its own visible text label", and with several folders
    sharing one list by default, glyph-only identity would have read _worse_
    than the uppercase tag it replaced — the opposite of what this change is
    for.

- **The colour the page gains is accent, in three places**: the unread dot,
  the selected row's left edge, and the selected folder chips. The page had
  effectively no colour at all before — that, not the absence of folder hues,
  is what made it read flat.
  - The last two are DESIGN.md §6's "accent = interactive/selected" directly.
    The unread dot is **state**, not selection, so §6 does not license it on
    its own — the precedent is `Tabs.tsx`'s own unread badge, which already
    painted this page's per-folder counts `bg-accent` before this change.

- **2px is allowed for a state stripe.** DESIGN.md §3's "Borders: always 1px"
  governs box borders. A 2px state edge already ships in `tabItemClassName`
  (`border-b-2`) and `OpenOrdersPanel`'s `GROUP_ACCENT` (`border-l-2`); the
  selected-row stripe is the same device.

- **A Sent row shows its recipient, not its sender.** The whole Sent folder
  otherwise reads as a column of your own name. The recipients are already
  resolved for the reading pane, so this costs no extra lookup — and it is
  what makes Sent distinguishable without spending a colour on it.

- **Two shipped defects fixed in passing, plus one tidy-up**, all in the
  same rows:
  - The received date used `text-text-faint`, which DESIGN.md §1 restricts to
    decoration ("never for content someone must read") and §7 measures below
    AA. Now `text-text-dim`.
  - Selection painted `bg-panel-2` — the exact fill hover already paints — so
    the open mail was invisible once the pointer moved.
  - `aria-current={selectedId === header.mail_id}` spelled out `"false"` on
    every unselected row. Not a defect — `false` is a valid `aria-current`
    token and is its default — but the attribute is now simply omitted
    instead.
