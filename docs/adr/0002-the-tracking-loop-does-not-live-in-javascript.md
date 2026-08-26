# ADR-0002 — The tracking loop does not live in JavaScript

## Status

Accepted — 2026-08-26.

## Context

A driver's phone must record position for three days, in a pocket, through
stretches with no signal, across app kills, low-memory reaps, reboots and
whatever the OEM's battery manager decides to do at 2am. That recording is the
product's only evidence: if it stops, the trip has no proof, and the whole
wedge — *where are my goods right now?* — fails.

React Native's JavaScript runtime is not a place that survives any of this. It
is suspended when the app backgrounds, torn down when the app is killed, and
absent entirely after a reboot until something launches the app. A tracking
loop written in JavaScript is a tracking loop that stops the moment the driver
locks the screen, which is the moment the trip actually starts.

Every failure of this kind is silent. Nobody notices until a shipper asks where
their goods were between Ilorin and Jebba and the answer is nothing.

## Decision

The capture loop is a native TurboModule on both platforms — an Android
foreground service, iOS background location with region monitoring — writing
fixes to a native SQLite queue. JavaScript is not in the path between a GPS fix
and durable storage.

What JavaScript owns is the **policy**, in `packages/domain/src/tracking.ts`:
how often to sample, when to upload, and when silence has lasted long enough to
mean something. The native side asks the policy what to do and does it. It
decides nothing on its own.

The split is on purpose. The policy is where the judgement lives and where it
will change most often — thresholds, battery ladders, what counts as stalled —
and it is testable against a nine-hour trip in a millisecond. The loop is where
the platform difficulty lives and it changes rarely.

Keeping the policy in one pure module also stops the two native
implementations from drifting into disagreeing about what "stalled" means,
which would show up as Android and iOS shippers seeing different alerts for the
same truck.

## Consequences

Two native implementations to write and maintain, and they are the hardest code
in the product. The roadmap gives this phase seven weeks and builds it alone,
before anything else, with three hard exit gates: zero position loss across a
simulated 1,000 km airplane-mode trip, under 4% battery per hour with the
screen off, and a 72-hour soak on physical Transsion hardware.

OEM battery management on Transsion devices — a large share of the Nigerian
market — is the specific risk, and it is not fully solvable from inside the
app. Mitigation is a mix of foreground-service priority, boot-completed
receivers, and telling the driver plainly when the OS has restricted the app.

Capture continues while the network is down. `shouldTrack` returns true for
`signal_lost` for exactly this reason: stopping capture when the signal drops
would lose precisely the stretch of road nobody can account for afterwards.
