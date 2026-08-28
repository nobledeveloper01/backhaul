# ADR-0018 — The device seals a delivery, and the server countersigns

## Status

Accepted — 2026-08-28.

## Context

Phase 4's exit gate is one sentence:

> A complete proof-of-delivery document generated on a device that has been
> **offline for the entire trip**.

`ProofScreen` cannot do it, and the comment saying why is the reason:

> The draft lives on the server, not in this component. A delivery is captured
> at a gate on a phone that may be closed, killed by the OEM, or out of battery
> before the driver reaches the office. Holding the photographs and the
> signature in `useState` means a delivery that vanishes when the app does.

Every word of that is right about durability and it picked the wrong durable
place. Today the screen reads `api.delivery(tripId)`, writes through
`api.putDelivery`, and takes `sealedAt` and `canSeal` from the server's answer.
A driver at a market gate in Kano with no signal can photograph the goods, take
a signature, and none of it exists anywhere — and the button that would close
the delivery is gated on a server view that will never arrive.

The stakes are not a lost form. `earnings.ts` skips a delivered trip with no
sealed proof and the escrow milestone never releases, so a delivery captured
and lost is a driver who finished the run and is not paid. That was found once
already on this project, as `sealDelivery` written and called by nothing.

Two things are tangled together here and only one of them is about the network:

- **Where the draft lives** — a durability question, and the answer is "on the
  device, durably" for the same reason the tracking queue is native SQLite:
  capture must continue when the network does not (ADR-0002).
- **Who decides it is sealed** — a rule question, and the current answer is the
  server, which is what makes the gate unreachable.

## Decision

**The device seals. The server countersigns.**

1. **The draft is written to the device first**, to `AsyncStorage`, keyed by
   trip. Every capture — a photograph, a signature, an exception, a note — lands
   there before anything is sent. It survives the app being killed, the OEM
   closing it, and the battery going flat, which is the whole of what the
   original comment was worried about.

2. **`seal()` is the rule, and it already runs on the phone.** It is pure, it
   is in the domain, it is parity-tested, and it needs nothing but the delivery
   in front of it: two photographs, a signature, a name. A delivery that
   satisfies it is sealed **at the moment the driver says so**, with a local
   timestamp, offline or not.

3. **The server's `sealedAt` is a countersignature, not a permission.** When
   the upload lands, the server records that it has the evidence and when it
   received it. The two timestamps are different facts and both are kept: when
   the delivery was made, and when this platform first saw it. A dispute wants
   both, and collapsing them into one loses the gap that a coverage hole
   explains.

4. **The document composes from the local draft.** `document()` and
   `documentText()` are pure and take a `Delivery`; nothing about producing the
   note requires a network. This is what the gate asks for and it is already
   true of the engine — what was missing was a `Delivery` to hand it.

5. **An unsent delivery says so, on the screen, and keeps saying it.** Not an
   error: a queue depth. The driver has done their part and the phone is
   waiting for a network, which is an ordinary condition on a Nigerian corridor
   and not a failure of theirs.

## Consequences

The gate becomes reachable, and reachable in the honest way: a device that has
never had a network can capture a delivery, seal it, and render the note the
consignee keeps. The test for it is a delivery driven end to end against an API
client that refuses every request.

**Two clocks, and they can disagree.** A device seal is stamped from the
device's clock, which a driver can change. The server's countersignature cannot
be. Where the two disagree the server's is the one that is evidence of *when we
knew*, and the device's is a claim about when it happened — which is what
`isModelled` and fix quality already do everywhere else in this product: state
both, present neither as the other.

**A sealed delivery can still fail to upload.** The local seal is not a promise
that the platform has it, and the screen must not imply otherwise. This is the
same rule as ADR-0009 — a fix is deleted only when the server acknowledged it —
and the local draft is kept until the countersignature comes back, not until
the request is sent.

**A conflict is possible and is resolved toward the evidence.** If the server
already holds a sealed delivery for a trip and the device offers a different
one, the server's is kept and the device's is not silently discarded — it is
kept locally and surfaced, because two sealed proofs for one delivery is
something a person needs to look at rather than something a merge rule should
quietly decide.

**The screen gets slower to reason about**, because it now reconciles two
sources instead of reading one. That is the cost of the gate, and the
alternative — a driver who cannot close a delivery they have actually made —
is not a trade this product gets to make.
