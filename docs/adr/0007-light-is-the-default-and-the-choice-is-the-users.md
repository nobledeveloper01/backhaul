# ADR-0007 — Light is the default, and the choice is the user's

## Status

Accepted — 2026-08-26.

## Context

The app was following the handset's appearance setting. That is the modern
default and it is the wrong one here.

Backhaul is read outdoors, in Nigerian daylight, far more often than it is read
in the dark: a driver at a loading bay at noon, a fleet owner checking a truck
from a yard, a shipper looking at a phone in a car park. A handset that happens
to be in dark mode — because its owner set it once, months ago, for reading at
night — should not decide that a screen is dark grey at midday.

Dark mode is not decoration either. It matters on a night run, and it matters
for battery on an OLED handset over a three-day trip, which is the constraint
this whole product is organised around.

So the requirement is not "pick one". It is: pick the one that is right most of
the time, and make the other reachable in one tap.

## Decision

**Light by default.** Not `system`.

A three-state preference — light, dark, or follow the phone — cycled from a
single labelled control in the shipper header. The control names the current
mode in words as well as an icon, because a theme toggle drawn only as a glyph
is the textbook case of shape and colour carrying meaning alone, and it is read
by someone deciding whether the screen is legible.

The control lives on the shipper face and nowhere else. The driver face has one
job and a settings affordance on it is one more thing between a driver and the
button they came to press.

**Both themes stay fully authored.** This is not a light product with a dark
skin: `DESIGN.md` defines both palettes together, every screenshot in the
README exists in both, and the definition of done requires both to be checked.

## Consequences

A user whose phone is in dark mode sees a light app until they say otherwise.
That is the intended trade and it is the one that is wrong least often, but it
will surprise somebody.

**The preference is stored**, in `AsyncStorage` under
`backhaul.appearance.v1`. It was React state at first and reset on every
launch, which is a small annoyance that arrives every single time.

Two details of the storage are deliberate:

- **The app renders in the default while the read resolves.** A dark-preferring
  user sees a frame or two of light. That is the right way round — starting
  dark and flashing to light is worse, and blocking the first render on a disk
  read to avoid either is worse still.
- **The write is fire-and-forget.** The choice has already taken effect on
  screen; a failed write costs the user the same tap next launch and nothing
  more, and there is nothing useful to tell them about it. Unreadable storage
  falls back to the default rather than failing to start.

Two palettes to keep honest rather than one. That cost is already paid: every
colour is a semantic token, no screen names a hex, and the elevation scale has
a light and a dark form because a shadow does nothing on a near-black
background.
