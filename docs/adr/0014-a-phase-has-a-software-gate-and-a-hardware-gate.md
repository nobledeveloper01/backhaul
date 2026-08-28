# ADR-0014 — A phase has a software gate and a hardware gate

## Status

Accepted — 2026-08-28.

## Context

`docs/ROADMAP.md` opens with a rule that has served this project well:

> A phase is done when its exit gate is green — not when the code is written.
> Gates are written before the phase starts and are not softened to fit what
> got built.

Phase 1's gate has three conditions. One is met in software and re-checked in
CI. The other two — **under 4% battery per hour** and a **72-hour soak on a
physical Tecno or Infinix** — cannot be met on this machine at all. They are
not slow, or hard, or unfinished. They require hardware nobody here has.

Read strictly, the rule says everything stops. Phase 2 does not start, so the
share-link rate limit and the shipper's map wait; phase 4 does not start, so
the dispute pack waits — and all of them are ordinary application development
that no amount of waiting improves.

Read loosely, the rule stops meaning anything: "we'll come back to the battery
test" is how a product ships with a tracker that flattens a phone by noon.

Both readings are wrong because the gate is measuring two different kinds of
thing with one word.

## Decision

**Every phase gate is split into a software gate and a hardware gate. The
software gate blocks the phase. The hardware gate blocks the release.**

- A phase's **software gate** is everything provable on this machine: tests,
  parity fixtures, the round trip, a screen walked through in four languages on
  a simulator and an emulator. When it is green, the phase is done and the next
  one starts.
- A phase's **hardware gate** is everything that needs a device in a hand.
  It is not softened, not estimated, and not signed off by a simulator. It is
  deferred to a **device day**, and until every deferred gate is green
  **v1.0 does not ship** — which is the same sentence phase 6 already ends on.

`PHASE` tracks the software gate, because that is the one that says what to
work on next. The deferred hardware gates are listed in one place in the
roadmap so the count is visible rather than remembered.

## Consequences

The work continues in phase order and the evidence does not get invented. A
phase marked done under this ADR is making a narrower claim than before, and
the roadmap says which claim it is making.

The risk this accepts is real: the deeper the phases go before a device day,
the more work sits on top of an unproven assumption — that the capture loop
survives an OEM battery manager. If it does not, ADR-0002's premise fails and
some of what was built on it is wasted. That trade is taken deliberately,
because the alternative is a project that stops entirely, and because the
capture loop is the *first* thing a device day tests rather than the last.

**Nothing here downgrades the hardware gates.** They are the same three
sentences, in the same words, in a list with a count on it. A phase that says
"software gate green" is not saying the product works on a phone; it is saying
somebody can start the next phase.
