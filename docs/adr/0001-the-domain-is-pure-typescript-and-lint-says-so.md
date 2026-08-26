# ADR-0001 — The domain is pure TypeScript, and lint says so

## Status

Accepted — 2026-08-26.

## Context

Everything Backhaul decides — whether a trip may change state, which position
fixes are worth believing, how often to sample, what a load is worth, when the
truck arrives, whose bid wins — is arithmetic over plain data. None of it needs
React Native, a device, a network or a clock.

Keeping that arithmetic in a package with no platform dependency buys three
things that are hard to get any other way:

- **Tests that run in milliseconds.** A nine-hour trip across a dead zone is a
  loop over an array, not an afternoon with a phone in a car.
- **One implementation.** The same package runs on the device, on the shipper's
  web console, and on the server that recomputes a disputed settlement. Three
  implementations of a demurrage rule is three answers to give a shipper.
- **Reviewability.** The rules that decide whether a driver is paid are
  readable without knowing anything about React.

The risk is not that anyone disagrees with this. It is that purity kept by
convention lasts exactly until someone needs a device id at 6pm on a Friday,
and the import that breaks it is one line in a diff nobody looks at twice.

## Decision

`packages/domain` imports nothing from React, React Native, Expo, the
navigation stack, the database driver, the state libraries or the map. The ban
is an ESLint `no-restricted-imports` rule over a pattern list in
`eslint.config.js`, so a violation fails CI rather than a code review.

Two further rules go with it, for the same reason:

- **No reading the clock.** `Date.now()` and argless `new Date()` are banned.
  Every engine takes `now: Date` as an argument. An engine that reads the clock
  cannot be replayed against a trip that has already happened, which is exactly
  what a dispute requires.
- **No randomness.** `Math.random()` is banned. A ranking that is not
  reproducible cannot be explained to the carrier who came second.

Banning the `Date` global outright was the first attempt and it was wrong:
projecting an arrival *is* `new Date(now.getTime() + ms)`. The rule targets the
two shapes that read the clock, not the constructor.

`scripts/boundary-check.sh` injects both violations and fails if ESLint does
not object to them. A gate that has silently stopped matching is worse than no
gate, because the build stays green and the guarantee is gone.

## Consequences

Anything the domain needs from the platform is passed in as an argument. That
is a small, constant tax — `now` threaded through every signature — and it is
the thing that makes the whole package testable.

The app layer is where platform code lives, and it is thin by construction: it
renders decisions it did not make.

There is a real cost when a decision genuinely needs platform state. The
tracking policy is the clearest case: it decides sampling intervals from
battery level, which only the OS knows. The battery reading is a field on the
`Conditions` argument rather than a call into the platform, so the policy stays
pure and the native side supplies the number.
