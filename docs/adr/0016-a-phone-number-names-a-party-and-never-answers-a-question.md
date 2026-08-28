# ADR-0016 — A phone number names a party, and never answers a question

## Status

Accepted — 2026-08-28. Blocks F12; no code yet.

## Context

The product's wedge is a trip arranged somewhere else — on WhatsApp, on a call,
in a yard — and tracked here. `POST /v1/trips/{id}` opens a trip and takes
three party identifiers:

```
DriverId: Guid   CarrierId: Guid   ShipperId: Guid
```

A shipper opening that trip has their own id and, for the other two, a phone
number. There is nothing in the product that turns one into the other, which is
why `openTrip` has sat in the client with no caller since it was written, and
why every trip that exists today came in through the marketplace — the half
that is worth nothing until there is liquidity.

The obvious fix is a lookup: `GET /v1/identities?phone=…`. It is also the
reason nobody has built this yet, because that endpoint is an enumeration
oracle. Any signed-in account could walk the Nigerian mobile range and learn,
number by number, who is on this platform and in what role. That is a list of
which drivers and which carriers are running loads, sold to anyone who wants it
for the price of one account. Rate limiting does not fix it; it slows it down.
ADR-0010 could reach for a rate limit on the share route because the caller
there already holds a 32-byte secret, and a caller here holds a guess.

The second problem is quieter. Naming a driver by phone number means the server
creates an account for a person who has not asked for one. There is a version
of that which is ordinary — the driver is about to be invited to a trip they
already agreed to — and a version which is not, which is anyone minting
accounts at will.

## Decision

**A phone number is only ever an argument to an action that names it. It is
never a question the API answers.**

Concretely:

1. **No lookup endpoint exists, now or later.** There is no route, in any
   shape, that takes a phone number and returns whether it is known, who it is,
   or what role it holds. If one is ever proposed, this ADR is what it has to
   argue against.

2. **`POST /v1/trips/{id}` takes `driverPhone` and `carrierPhone` instead of
   GUIDs**, and resolves-or-creates each one the way `SignInRepository` already
   resolves-or-creates on sign-in.

3. **The response is identical whether the account existed or not.** Same
   status, same body, same timing class. The caller learns that the trip they
   just created has a driver on it, which they knew before they asked. They
   learn nothing about the number they typed. This is what makes (2) safe and
   it is the whole of the decision — an endpoint that creates something is not
   an oracle, provided its answer does not vary with what it found.

4. **A minted account holds the number and nothing else.** No name, no role
   claim, no verification tier. It becomes a real account the first time the
   person holding that SIM signs in through the existing OTP flow, at which
   point the trips already naming them are simply there. Until then it is a
   place for a trip to point at.

5. **The caller must be one of the three parties**, as `TripParties.Admit`
   already requires. A shipper can name a driver and a carrier on a trip they
   are the shipper of. Nobody can mint a pairing they are not part of.

6. **Trip creation is rate limited per account**, not per address — the caller
   is authenticated here, unlike the share route, so the limit can be attached
   to the thing that actually costs something to obtain.

## Consequences

The wedge becomes buildable, and it becomes buildable in the form the roadmap
already describes: the shipper types the number they have been messaging all
morning, the trip opens, and the SMS invite tells the driver where to look.
Phase 2's open software condition is one endpoint change, one screen, and the
invite.

A shipper can cause an SMS to be sent to an arbitrary number by opening a trip
naming it. That is the residual abuse surface and it is the reason for (6). It
is bounded by something real: one message per trip opened per account per
window, against an account that took a working Nigerian SIM to obtain.

Somebody will eventually want to check a number before typing it — "is this
driver already on Backhaul?" — and the honest answer is that the product will
not tell them, because the same answer told to the wrong caller is the list
this ADR exists to prevent. The trip works either way, which is what makes
refusing the question affordable.

The parity fixtures are untouched: this is an API contract and an account
lifecycle, not a rule the domain holds. `TripParties` keeps taking GUIDs and
keeps deciding who may see a trip; the resolution from number to id happens in
front of it, at the edge, once.
