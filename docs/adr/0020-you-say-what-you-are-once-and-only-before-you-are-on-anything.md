# ADR-0020 — You say what you are once, and only before you are on anything

## Status

Accepted — 2026-08-28.

## Context

Nobody can post a load.

Signing in for the first time mints a **driver**. That is deliberate and
`SignInRepository` says why: it is the role that can see the least, and
guessing upward would hand somebody a fleet. No endpoint changes a role
afterwards — also deliberate, and ADR-0016 leans on it, because a role that any
caller can set is an authorisation model with a hole in it.

Between the two there is no third step, so the only accounts that have ever
been shippers are the ones the test suite mints directly through
`TokenRepository`. `SaveLoadAsync` refuses a non-shipper, which means the load
board, the bid ranking, the award, and the trip that now comes out of it are
all reachable only from a test. The marketplace half of the product has no door
into it.

This surfaced from the shipper console, where **Post a load** answered *"The
server answered 404"* — a create that 404s, for a reason that is neither the
load nor the request.

Three ways out were available:

1. **Ops assigns every role**, as with `Reviewer`. Correct for a role that
   confers authority over other people; wrong for shippers, who are the demand
   side and have to be able to self-serve at three in the morning.
2. **Infer it from behaviour** — you become a shipper by posting a load. That
   is a role that changes underneath the authorisation model as a side effect
   of an unrelated action, which is how somebody ends up able to see a trip
   they could not see yesterday.
3. **Ask, once.**

## Decision

**A person may set their own role exactly once, and only while their account
has never been named on anything.**

`PUT /v1/me/role` takes `driver`, `carrier` or `shipper`. It succeeds only when
**no trip names this account** as any of its three parties and **no load
belongs to it**. After that the role is fixed and the endpoint refuses, with
the reason.

- **`Reviewer` is not settable.** It is the one role that confers authority
  over other people's records, and ADR-0017 makes its unreachability from any
  public path load-bearing. The regular expression on the request does not
  include it and the controller refuses it a second time.
- **The window is "before you are on anything", not "within an hour".** A
  clock would be arbitrary and would still be open at the moment somebody's
  first trip is created. The condition that matters is whether changing the
  role could change who can see something that already exists, and that is
  exactly what this checks.
- **The default stays `driver`.** Somebody who never answers is the role that
  can see the least, which is the same reasoning that put it there.

## Consequences

The demand side of the product has a door. A shipper installs the app or opens
the console, signs in, says what they are, and posts a load — without an
operator in the loop, which is the difference between a marketplace and a
sales process.

**A role is still not a claim about anybody.** Saying you are a carrier makes
you a carrier for authorisation purposes and nothing else: the tier ladder is
untouched, every paper still needs a reviewer (ADR-0017), and a carrier who has
said so has proved exactly nothing about their licence or their insurance.
Nobody should read a role as a credential, and no screen should render one as
a badge.

**Somebody will choose wrong and be stuck.** A driver who meant shipper, after
their first trip, cannot fix it themselves — and the honest answer is that they
need a second account or an operator, because the alternative is a role that
moves under a trip's authorisation. That cost is real and it is smaller than
the one it buys: `TripParties.Admit` matching on role and id is the whole of
this server's access control, and it is only sound while a role is stable for
as long as the things that reference it.

**The check costs two queries on one endpoint** that is called at most once per
account. That is the right place to spend them.
