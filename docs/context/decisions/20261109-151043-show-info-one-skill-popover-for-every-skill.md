# Scope decisions — Show info: one skill popover for every skill-affected figure

_Recorded 2026-11-09._

- **Every figure a skill can change opens one popover from a dashed-underlined number.** A figure the pilot's skills change reads "base → skilled" (green, semibold); a figure none of the pilot's skills change yet reads as the plain base number with the same dashed underline, no bold, no green, no arrow. The old select-box chip is gone.
- **The popover lists each skill that changes it:** its effect per level, the pilot's level, what the next three levels would make the figure, and Add to Skill Plan for the next level. The previews scale the shown figure by the skill's PostPercent bonus; they ignore stacking penalties and are not run through the dogma engine. A row that shows a resolved name instead of a number gets no previews.
