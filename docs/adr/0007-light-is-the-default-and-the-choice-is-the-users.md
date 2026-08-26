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

**The preference does not survive a restart.** It is React state, not storage.
Persisting it needs a native storage dependency and another CocoaPods cycle,
which is not the trade at phase 0 — but a preference that resets every launch
is a real annoyance rather than a theoretical one, and it is in
`docs/FEATURE-BACKLOG.md` rather than left to be rediscovered.

Two palettes to keep honest rather than one. That cost is already paid: every
colour is a semantic token, no screen names a hex, and the elevation scale has
a light and a dark form because a shadow does nothing on a near-black
background.
