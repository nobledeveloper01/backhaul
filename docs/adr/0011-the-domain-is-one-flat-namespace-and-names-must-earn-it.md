# ADR-0011 — The domain is one flat namespace, and names must earn it

## Status

Accepted — 2026-08-27.

## Context

`packages/domain` exports everything through one barrel, `src/index.ts`, and
consumers write `import { quote, observe, tierOf } from '@backhaul/domain'`.
That is deliberate and it has worked: there is one import line in every screen,
and no consumer needs to know which file a rule lives in.

It has now produced the same failure five times.

| Name | Claimed by | Collided with | Renamed to |
|---|---|---|---|
| `CAPACITY` | `queue.ts` | `pricing.ts` (truck capacities) | `QUEUE_CAPACITY` |
| `Leg` | `chaining.ts` | `utilisation.ts` | `ChainLeg` |
| `fits` | `chaining.ts` | `pricing.ts` | `canFollow` |
| `Conditions` | `escrow.ts` | `tracking.ts` | `EscrowConditions` |
| `MINIMUM_TRIPS_FOR_RATE` | `earnings.ts` | `trust.ts` | `MINIMUM_TRIPS_FOR_PER_KM` |

The last one happened while this ADR was being written, which is as good a
demonstration of rule 1 as the rule could ask for: *"a rate"* is a question two
engines both wanted to answer, and neither name said which rate.

Every one was caught by `tsc` at the barrel, in seconds, with a clear message.
None reached a review, a test or a screen. The tooling is doing its job.

But the *rate* is the signal: twenty-eight modules in, a new engine has a
roughly even chance of colliding with something, and each collision is a rename
across a file plus its tests. The obvious fixes both cost more than the problem.

**Namespacing the exports** (`escrow.Conditions`) removes the collision and
removes the thing that makes the barrel worth having: a screen would import
seven namespaces to render one card, and the flat surface is the reason the app
layer reads as well as it does.

**Renaming everything defensively** (`EscrowConditions`, `TrackingConditions`,
`PricingCapacity`) is a prefix on every export in the package to prevent a
collision that `tsc` already catches for free. It makes 200 names worse to
prevent 5 from clashing.

## Decision

**Keep the flat barrel. Name for the reader, and let `tsc` arbitrate.**

Three rules, which are what the four renames above actually taught:

1. **A name that could belong to any engine belongs to none.** `Conditions`,
   `Leg`, `CAPACITY`, `fits` and `MINIMUM_TRIPS_FOR_RATE` are all generic
   enough that two engines wanted them. Reach for the specific word first — `EscrowConditions`, `ChainLeg`,
   `canFollow` — not because of the collision, but because at the *call site*
   `canFollow(previous, next)` says what `fits(previous, next)` did not.

2. **Domain nouns keep the short name; mechanisms take the qualifier.** `Trip`,
   `Position`, `Kobo`, `Waypoint`, `Incident` are the vocabulary of the
   business and should never grow a prefix. A queue's capacity is a mechanism,
   and `QUEUE_CAPACITY` is the honest length for it.

3. **The barrel is the check, and it runs before the tests do.** No lint rule,
   no naming convention enforced by a script. `make typecheck` fails on a
   duplicate export with the file and the name in the message; adding a
   mechanism to detect what the compiler already detects is a second thing to
   maintain.

## Consequences

- Collisions keep happening, and keep being trivial. That is the accepted cost.
- The fifth one was caught eleven minutes after this file was written, by the
  compiler, in the way described. The mechanism is the point; the count is not
  a problem to be solved.
- A rename is a rename across `src/x.ts` and `test/x.test.ts` and nothing else,
  because nothing outside the package had a chance to import the name — the
  compile fails at the barrel, before any consumer sees it.
- If the package ever grows a second consumer with its own vocabulary — a web
  console, say — revisit. The argument for flatness is that there is one app
  and its screens are thin; that premise is what would have changed.

## Alternatives considered

**Per-engine namespaces, exported as objects.** Removes collisions entirely and
makes `import * as escrow` possible. Rejected on the call site: the screens are
the reason this package exists, and every one of them would get longer and
noisier to solve a problem the compiler solves in under a second.

**A lint rule that requires a module prefix on every export.** Would have
prevented all five, and would have named 200 things worse to do it.
