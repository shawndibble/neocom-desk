# Scope decisions (round 19) — app-wide page width

_Recorded 2026-09-01._

- Nearly every route sat at `mx-auto max-w-3xl` (768px) regardless of
  content, a pattern predating Market's and Mail's two-pane rebuilds. This
  round retiers that width, **widen only** — no page gets restructured as
  part of it.
- **Tiers**: `max-w-3xl` unchanged (Overview, Settings — nothing measurably
  cramped, more width is just dead space); `max-w-5xl` (1024px) for
  everything single-column that the content survey showed genuinely
  squeezed — Clones, EmploymentHistory, Contracts, Contacts, Wallet, Orders,
  Skills, Characters, Assets, PlanetaryIndustry, Calendar, SkillPlans,
  Industry; `max-w-6xl` unchanged for the two-pane pages (Market, Mail).
  **SkillCompare goes to a generous cap (`max-w-7xl`) with its `DataTable`
  wrapped in its own `overflow-x-auto` container** — same pattern
  `MaterialsTable` already uses. A capless `w-full` was considered and
  rejected: `DataTable` renders a bare `<table>` with no built-in scroll
  fallback, so uncapped width with unbounded per-character columns would
  either force the whole page to scroll sideways or produce absurdly wide
  rows on a large monitor, once enough characters are selected.
- **Calendar and Industry stay vertically-stacked master-detail** (list
  Panel above detail Panel/editor) — they are Mail-shaped (Industry's
  materials table already needed its own `overflow-x-auto` at 768px, the
  clearest evidence), but converting them to a real side-by-side pane is
  deferred as its own follow-up per page, not bundled into a width pass.
  SkillPlans got its own follow-up in round 21.
- **Assets** gets the `max-w-5xl` tier now (less name truncation, more room
  per tree-depth indent); replacing its hover-tooltip detail with a real
  detail pane (a tree+detail split, the same shape as the deferred
  Calendar/SkillPlans/Industry work) is separately deferred.
- **Characters' card grid gains a `lg:grid-cols-3` breakpoint** at the wider
  width (a real third column, not wider padding on two); PlanetaryIndustry's
  repeated colony panels get the same treatment where applicable.
