/**
 * The capture loop's native half.
 *
 * A separate package rather than files inside the app, for two reasons that
 * both cost time to learn the other way: React Native's autolinking discovers
 * a library by its podspec and its Gradle module, so neither Xcode's
 * `project.pbxproj` nor the app's `build.gradle` has to be hand-edited to add
 * a source file — and the codegen runs per package, so the spec lives beside
 * the implementations it generates glue for.
 *
 * `NativeTracking.ts` is the contract. Everything about *why* the loop is not
 * in JavaScript is in ADR-0002 and at the top of that file.
 *
 * Two smaller seams live here too rather than in packages of their own,
 * because a linked package is a CocoaPods and Gradle cost paid per package:
 * `NativeOutbox.ts`, the wake that sends a pocketed delivery (ADR-0023), and
 * `NativeDocuments.ts`, the share sheet handed a file (ADR-0024). Each is a
 * verb or two, and each decides nothing.
 */

export { default as NativeTracking } from './NativeTracking.ts';
export type { NativeFix, TrackingStatus, Spec } from './NativeTracking.ts';

export { default as NativeOutbox } from './NativeOutbox.ts';
export { default as NativeDocuments } from './NativeDocuments.ts';
export type { Spec as DocumentsSpec } from './NativeDocuments.ts';
export type { Spec as OutboxSpec } from './NativeOutbox.ts';

/** The event the iOS refresh task posts; the sweep runs when it arrives. */
export const OUTBOX_REFRESH_EVENT = 'outboxRefresh';

/** The headless task Android's periodic job starts. Registered in `index.js`. */
export const OUTBOX_TASK = 'BackhaulOutboxSweep';
