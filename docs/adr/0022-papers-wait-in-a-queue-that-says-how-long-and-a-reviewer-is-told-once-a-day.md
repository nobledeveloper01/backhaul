# ADR-0022 — Papers wait in a queue that says how long, and a reviewer is told once a day

## Status

Accepted — 2026-09-17.

## Context

ADR-0017 made a tier something a reviewer confirms rather than something a
carrier declares, and it left the reviewer to find the work: the profile
row has `HasLicence` and `VerifiedLicence`, nothing records *when* a claim
was made or *whether anyone has looked*, and the same `false` means "not yet
reviewed" and "reviewed and refused". Right for a pilot with one operator who
knows every carrier. At a hundred carriers a week it is a backlog nobody can
see, and the README's open list says the thing to build is the queue, not an
automatic approval.

The obvious shape is a notification per claim. A reviewer told forty times
a day stops reading, which is the same argument this project makes about
alert thresholds, and a reviewer who reads none of them has a queue that is
invisible again.

## Decision

**A claim is a row, and a review is what closes it.** `PaperClaims`: the
carrier, the paper, when it was claimed, and — once a reviewer answers — when
and what. Claiming a paper already claimed and unreviewed is a no-op; claiming
one that was reviewed opens a fresh row, because a new upload is a new claim.
The `Has…`/`Verified…` flags stay as the fast read the tier ladder uses;
the rows are the history and the queue.

**`GET /v1/verification/queue`, reviewers only, oldest first**, each entry
carrying how long it has waited. Age is the queue's whole point: the reviewer
sees not just that work exists but which of it has been waiting a week.

**A reviewer is told once a day that the queue is non-empty**, through the
dispatcher that already reaches people, and only when it has something older
than an hour — a claim made a minute ago does not need a message. The
notification says the count and the age of the oldest; it names nobody,
because a push is a channel this product does not control.

**No automatic approval, and no expiry.** A claim nobody reviews waits. The
alternative — approve after a week of silence — is ADR-0017's self-declared
tier with a delay.

## Consequences

The queue can be read by the operator console and by any later reviewer
tool without a second endpoint. The 404-not-403 rule holds: a non-reviewer
asking for the queue is told there is no such route.

Two things get slower. Setting a paper writes two rows. And the dispatcher
gains a query per turn that is nearly always empty, which is the cheapest
kind.

What it does not do is tell the *carrier* their paper is under review or
refused; that is a message in five languages and is left for the carrier
face with the rest of its verification copy.
