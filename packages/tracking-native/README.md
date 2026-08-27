# `@backhaul/tracking-native`

The capture loop. An Android foreground service and iOS background location,
both writing to a native SQLite queue.

Read [ADR-0002](../../docs/adr/0002-the-tracking-loop-does-not-live-in-javascript.md)
for why none of this is in JavaScript, and
[ADR-0009](../../docs/adr/0009-a-fix-is-deleted-only-when-the-server-acknowledged-it.md)
for why reading the queue and emptying it are two separate calls.

## The one rule

**The native side decides nothing.** It captures, it stores, it hands back the
oldest rows, and it deletes exactly the ids it is told to delete. Every
judgement — sampling cadence, when to upload, what counts as silence, what may
be deleted — lives in `@backhaul/domain`, which is pure TypeScript with 534
tests and no device anywhere near it.

That is why the two platforms cannot drift into disagreeing, and why the policy
can be tested without a truck.

## Why it is a package

Not files inside the app. React Native's autolinking finds a library by its
podspec and its Gradle module, so adding a source file needs no edit to Xcode's
`project.pbxproj` and none to the app's `build.gradle` — and the codegen runs
per package, so `src/NativeTracking.ts` sits beside the implementations it
generates the glue for.

## What each side does differently, and why

| | Android | iOS |
|---|---|---|
| Staying alive | Foreground service, `START_STICKY`, `BootReceiver` | Background location mode, significant-change relaunch |
| Cadence | `requestLocationUpdates` interval | Fixes discarded below the interval — CoreLocation has none |
| Provider | `LocationManager`, **not** fused | `CLLocationManager` |
| "The OS is throttling us" | Background restriction, doze whitelist | Authorisation, Low Power Mode |

**`LocationManager` rather than Play Services' fused provider** is the one that
will look wrong to an Android developer. Many Transsion handsets — which
dominate the driver segment this product is built for — ship without Google
Play Services at all, and a tracking product that silently records nothing on
those phones is worse than one that never claimed to.

**`pausesLocationUpdatesAutomatically = NO`** is the iOS equivalent: on by
default, and it pauses updates when iOS decides the device is stationary. A
stationary truck's *duration* is what a demurrage claim is made of.

## What has not been proven

Both implementations compile and both are wired end to end through
`apps/mobile/src/native/tracker.ts`. Neither has run on a physical handset, so
phase 1's two hardware gates — under 4% battery per hour, and a 72-hour soak —
are still open. No simulator answers either question: the risk they exist to
catch is OEM battery management killing a foreground service, and that only
happens on the device it happens on.
