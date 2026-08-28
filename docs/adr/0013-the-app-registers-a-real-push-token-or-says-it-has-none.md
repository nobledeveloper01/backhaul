# ADR-0013 — The app registers a real push token, or says it has none

## Status

Accepted — 2026-08-28.

## Context

The alerting path is built except for its last two metres.

`alerts.ts` decides what reaches a phone, who hears it, and when — one policy,
parity-tested on both sides, with exactly one urgent kind because if everything
is urgent nothing is. `AlertDispatcher` runs it every five minutes: derive what
is true, ask `Alerts.Decide`, send what it says, record only what went out.
`NotificationRepository` holds the two facts that cannot be derived — the token
to send to, and that something already went. `IPushSender` is the seam, and
`LoggingPushSender` writes what it would have sent.

`DevicesController` accepts a registration. `BackhaulApi.registerDevice` posts
one. **Nothing in the app has ever called it.**

So there are no devices, the dispatcher has nobody to tell, and the alerts
screen says "Wakes you" and "Notifies" beside each kind of alert — describing a
delivery that has never happened on any phone. That is the same defect as the
driver screen saying "we are recording your trip" over a capture loop nobody
started, and it was found the same way: by asking what calls this.

Getting a token is where the credentials are.

- **APNs** wants a p8 key from a paid Apple developer account to *send*.
  Obtaining a token on the device needs `registerForRemoteNotifications` and a
  native delegate callback, and the simulator has issued tokens since iOS 16.
- **FCM** wants a `google-services.json` from a Firebase project, and the
  Android SDK will not produce a token without one.

Neither is a technical decision. Both are somebody obtaining a credential.

## Decision

**The app registers a token when it genuinely has one, and reports that it has
none when it does not. It never registers a placeholder.**

A registration is a promise that a person can be reached. A row in `Devices`
with an invented token is a promise the platform cannot keep, and the failure
is silent in the worst possible direction: the dispatcher marks the alert sent,
`repeatAfterMs` suppresses the retry, and the shipper is never told about the
stall. Better one device row that works than a hundred that look like they do.

`native/push.ts` is the seam, in the same shape as `native/permissions.ts`: it
answers with a token, or with a phrase key saying why there is none. The phrase
is a key rather than a sentence for the same reason `explain()` returns one —
the driver face is read in four languages and this module knows none of them.

**The alerts screen says which it is.** When the install cannot receive
notifications, the screen says so above the policy rather than describing which
alerts would wake somebody. The policy is still worth showing — it is what the
product promises — but it is labelled as the promise rather than the present
tense.

## Consequences

Adding a provider is a swap at one file on each side: `IPushSender` on the
server, `push.ts` on the app. Everything between — registration, per-person
timezone offsets, quiet-hour holding, the overnight digest, `repeatAfterMs`
deduplication — runs today and is exercised by tests and by the round-trip.

`LoggingPushSender` stays the default even against a real database, and says
"not sent — no gateway configured" on every send. A deployment that believes it
is notifying shippers and is not is worse than one that never claimed to.

What this does not do is prove the last hop. A token that APNs accepts, from a
key that Apple issued, delivering to a phone in Kano, is unproven and stays
unproven until somebody holds both the credential and the handset — the same
sentence as the battery and soak gates in phase 1, and for the same reason.
