# ADR-0023 — The phone is woken to send what it holds, and decides nothing while awake

## Status

Accepted — 2026-09-17.

## Context

ADR-0018 put the sealed delivery on the device and the outbox sweeps it when
the app runs or returns to the foreground. That was honest and it left the
case it named: a driver who seals at the gate, pockets the phone and never
opens the app again holds a delivery the server never sees, and
`earnings.ts` skips a delivered trip with no sealed proof, so that driver is
not paid.

The obvious fix is a native uploader: store the request in native SQLite and
let a background job send it. It fails two of this product's rules at once.
The native side decides nothing (ADR-0002, `NativeTracking`) — and an
uploader that holds a bearer token, retries, and marks acknowledgements is
deciding a great deal. And the token rotates through `KeychainTokenStore` and
the refresh flow, both of which live in JavaScript; a second copy in a native
queue is a second place a credential lives and a second thing to get wrong.

The other obvious fix is a plugin. There is none in the tree and the
portfolio's rule is not to add one for a single seam.

## Decision

**The native side wakes the JavaScript side, and the JavaScript side runs
the sweep it already has.**

- **Android**: a `WorkManager` periodic job, constrained to a connected
  network, starts a `HeadlessJsTaskService` that runs the outbox sweep with
  the same drafts, the same API client and the same token store the
  foreground uses. It runs when the app is closed; it does not run when the
  user has force-stopped it, which Android forbids and this ADR does not
  pretend around. The job is enqueued when a delivery is sealed and cancelled
  when nothing is waiting, so a phone with no deliveries costs nothing.
- **iOS**: a `BGAppRefreshTask`, registered at launch and submitted when a
  delivery is sealed, posts an event the JavaScript side listens for and runs
  the same sweep inside the task's window. iOS grants it when it likes and
  not at all after a force-quit; the sweep on foreground stays, because that
  is still the moment most likely to have signal.

**The sweep is one function, `sweepOutbox(api)`, called from three places** —
the foreground effect, the Android headless task and the iOS refresh
listener — so there is one place a draft is sent and one place it is
acknowledged. It sends in order, one at a time, for the reason the outbox
comment gives.

**Nothing native reads a draft or holds a token.** The native side's whole
knowledge is "there is something to send" (a boolean it is told) and "now is
a good time" (a network constraint the OS evaluates).

## Consequences

The pocketed phone sends its delivery the next time the OS runs the job on a
network, which on Android is within the fifteen-minute floor of a periodic
job and on iOS is when iOS decides. Neither is a guarantee; both are more
than "never", which was the state before.

The delivery the phone holds is proof the OS may take hours to forward, and
that is what the two timestamps in ADR-0018 were for.

What is still owed is a handset (R-list): a headless task is proved here by
running its function under test and by both platforms compiling, not by
watching a phone in a pocket send.
