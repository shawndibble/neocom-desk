# Scope decisions — Alt colonies join the Advisor's plan but never its cards

_Recorded 2026-09-06._

- **Other Characters' colonies feed the combining plan; they get no cards.**
  Those planets are not the active Character's to rebuild, and a card offering
  to pull a pin off somebody else's colony would be advice aimed at the wrong
  pilot. They exist to be _routed from_ — which is the whole point, since a
  player with several alts is exactly the player whose P1s live on planets one
  character cannot combine.

- **Its own switch, not the Colonies panel's.** That one is ephemeral
  `useState` on another tab and answers "show me"; this answers "plan with", and
  sharing it would couple two tabs through the route and lose the choice on
  every reload. Off by default, and only rendered when the roster actually has
  colonies — a pilot with one Character should not be handed a control that can
  do nothing.

- **Cache-only, inherited from `roster.ts`.** Page open costs no extra ESI for
  alt colonies. A Character whose colonies have never been read contributes
  nothing rather than appearing empty, which is the same refusal `networkColonies`
  already makes for a colony whose detail did not load: an unread colony is not
  an empty one.

- **An alt's customs rate is derived with an unknown skill, not the active
  Character's.** Customs Code Expertise is trained per Character and the roster
  never reads an alt's skills. Borrowing the active Character's would be an
  invented number; the un-reduced rate understates the margin, which is the safe
  direction, and `customsRateSource` already has a name for not knowing.

- **A route from an alt's planet names its owner.** "Route in from Ashab IV" is
  not an instruction the reader can act on if Ashab IV belongs to a character
  they would have to log in as first.

- **Only the alt's own colony planets are advised, not their whole system.**
  `systemAdvice` is given one `SystemPlanet` per alt colony rather than every
  planet in that system: this is material to route from, not a system the active
  Character is being advised about, and asking `/universe/planets` about planets
  nobody is being advised on would be ESI traffic for nothing.
