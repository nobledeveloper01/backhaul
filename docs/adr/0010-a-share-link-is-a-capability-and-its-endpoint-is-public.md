# ADR-0010 — A share link is a capability, and its endpoint is public

## Status

Accepted — 2026-08-27.

## Context

Phase 2's wedge is a cargo owner watching a truck they did not book on an app
they have never installed. `packages/domain/src/sharing.ts` decides what such a
person may see; nothing serves it.

Everything else in this API is behind a bearer token, and
[ADR-0008](0008-authorisation-is-a-query-filter-not-a-controller-check.md) makes
authorisation a filter on the query rather than a check in a controller. The
share endpoint cannot work that way. There is no account to be a principal of —
requiring one is precisely the friction the wedge exists to avoid, and a wedge
that begins with "create an account" spreads to nobody.

So this is the one route that answers an unauthenticated request with somebody's
truck's position, and it is therefore the most exposed surface in the product.
It deserves a decision written down rather than an endpoint written quickly.

## Decision

**The token is the authorisation.** A share link carries 32 bytes from
`RandomNumberGenerator`, the same as a bearer token, and holding it is the whole
of the claim. There is no session, no cookie and no account.

Five things follow, and each one is the reason this is an ADR rather than a
commit message.

**1. The token is stored as a SHA-256 and never in readable form.** Same rule as
`AccessTokenEntity`, for the same reason: a leaked database should be a set of
useless hashes rather than a set of working links. Nothing in the product ever
needs to show a link back to anybody — the sender got it once, at creation.

**2. Scope is stored, not requested.** The holder cannot ask for `evidence` by
changing a query parameter. `visibleUnder(scope)` runs on the server against
the scope on the row, and what it returns is the shape of the response body —
so a field added to that response inherits the decision instead of forgetting
it.

**3. Contact details and money are `false` in the type, not filtered in the
controller.** The domain's `Visible` interface types them as the literal
`false`, so a future response that tries to include a phone number does not
compile. This is the same instinct as ADR-0008: put the rule where forgetting it
is impossible rather than where remembering it is required.

**4. Expiry is mandatory in practice.** `DEFAULT_SHARE_DAYS` is 14 and the
issue endpoint has no way to say "never". A link with no expiry is a permanent,
unauthenticated view of where a truck is, which is a thing worth stealing —
the product statement lists theft-by-platform as a live risk, and this route is
the one that would serve it.

**5. Revoked, expired and unknown are answered differently — and this is a
deliberate departure from ADR-0008.**

That ADR returns **404 for an unauthorised read**, because the existence of a
trip id is itself information and a 403 confirms it. Trip ids are guessable
enough for that to matter: they are handed around, they appear in URLs, and a
shipper could enumerate them.

A share token is not. It is 32 bytes of cryptographic randomness, and anybody
holding one that parses already has the capability the answer would confirm.
Telling them *why* it stopped working leaks nothing they could not already
determine, and refusing to tell them costs a real thing: a cargo owner whose
link has lapsed and one who was deliberately cut off need different sentences,
and "not found" for both invites a phone call about trust to a haulier who did
nothing wrong.

So: **410 Gone** for revoked and expired, with the reason and the domain's own
sentence in the body; **404** for a token nobody issued.

## Consequences

- The public allow-list in `RequireBearerMiddleware` grows by one prefix,
  `/v1/share`. It is an allow-list precisely so that this addition is a visible,
  deliberate line in a diff rather than an omission.
- **Rate limiting is now load-bearing and does not exist yet.** Guessing a
  32-byte token is not a threat; hammering an unauthenticated endpoint is.
  Tracked as a phase 2 gate item — this route must not ship without it.
- Issuing and revoking stay authenticated, and a link may only be issued by
  somebody `TripParties.Admit` already lets read the trip. The public route
  reads; it never creates.
- A shared trip's position history is served without the shipper knowing who
  is watching. That is inherent to a link — the same property that makes it
  work in a market where the recipient has no account — and the mitigation is
  that the sender can see every link they issued and turn any of them off.

## Alternatives considered

**A one-time code exchanged for a short-lived token.** Better hygiene, and it
puts an extra step between an SMS and an answer. The wedge is measured in
whether a cargo owner who has never heard of Backhaul gets to a truck's position
in one tap, and the exchange costs exactly that tap. Revisit if links start
leaking in practice.

**404 for everything, per ADR-0008.** Consistent, and worse for the person the
feature exists for. The reasoning above is why the rule bends here; the ADR
exists so that the bend is documented rather than discovered later as an
inconsistency.
