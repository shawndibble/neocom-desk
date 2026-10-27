# Scope decisions — Buying planetary inputs at a hub is opt-in

_Recorded 2026-09-06._

- **Market sourcing is a checkbox, off by default.** Buying P1 to feed an
  Advanced Industry Facility is a good strategy and a common one, and the
  arithmetic likes it — about +6,300 ISK/hr a factory at Jita against a Basic
  Industry Facility's 2,600–3,100. It also assumes a trade hub you can reach.
  The pilot this was built with is thirty minutes out, which turns that margin
  into a standing freight commitment they never agreed to. An earlier commit had
  it hardcoded on; advice that quietly assumes a shop next door is advice for
  somebody else's operation.

- **Routing between the pilot's own colonies is never gated by it.** That is
  hauling too, but it is hauling they already control, and it is the case this
  surface exists to find: several planets each refining a different P1 that no
  one planet can combine. `planNetwork` finds those with buying off, and the
  pilot named this as the case worth hauling for.

- **One switch for the tab, not one per colony.** It describes the pilot's
  situation — where they are, what they can reach — not a property of a planet.

- **Off must not mean silence.** Turning it off would otherwise restore exactly
  the gap the action list was built to close: a pilot making no P2 gets nothing
  about an Advanced or High-Tech facility, which is the original complaint
  ("what am I supposed to have them output?") reintroduced as the _default_
  experience. So `planNetwork` gains a `needs-buying` blocker and the panel says
  which products are one hub run away.

- **Only partly-reachable candidates are named.** A `needs-buying` entry is
  reported when the colony set makes at least one of a product's inputs. Every
  other schematic in the game is also unreachable, and listing those would be a
  catalogue rather than advice. They are kept out of the generic blocked list
  too, which would otherwise print a dozen lines saying the same thing.

- **Device-local, via `createLocalSetting`.** Not Editable Data: it is a fact
  about the machine's owner and their access to a hub, and it does not belong in
  planSync's `sync.` namespace.
