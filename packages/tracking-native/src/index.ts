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
 */

export { default as NativeTracking } from './NativeTracking.ts';
export type { NativeFix, TrackingStatus, Spec } from './NativeTracking.ts';
