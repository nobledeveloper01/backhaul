/**
 * One flat surface, so a screen has one import line.
 *
 * Duplicate names across engines are caught here by `tsc`, in seconds, with
 * the file and the name in the message. That is the whole enforcement
 * mechanism and it is deliberate — see ADR-0011, which also records the four
 * collisions that produced the rule.
 */

/**
 * The domain. Pure TypeScript: no React Native, no DOM, no I/O.
 *
 * Everything the product actually decides lives behind this barrel — what a
 * trip may do next, which fixes are worth believing, how often to sample, what
 * a load is worth, when the truck arrives, and whose bid wins. The app
 * renders these decisions; it does not make them.
 *
 * The boundary is enforced by lint rather than convention (see ADR-0001),
 * because the value of a pure domain is entirely in it staying pure and the
 * first `import { Platform }` is the one that ends it.
 */

export * from './trip.ts';
export * from './geo.ts';
export * from './tracking.ts';
export * from './queue.ts';
export * from './stops.ts';
export * from './utilisation.ts';
export * from './sharing.ts';
export * from './waypoints.ts';
export * from './trust.ts';
export * from './messages.ts';
export * from './incidents.ts';
export * from './pod.ts';
export * from './ratings.ts';
export * from './search.ts';
export * from './chaining.ts';
export * from './deviation.ts';
export * from './alerts.ts';
export * from './budget.ts';
export * from './vehicles.ts';
export * from './duress.ts';
export * from './cancellation.ts';
export * from './dispute.ts';
export * from './drops.ts';
export * from './levies.ts';
export * from './escrow.ts';
export * from './costs.ts';
export * from './consolidation.ts';
export * from './language.ts';
export * from './earnings.ts';
export * from './lanes.ts';
export * from './otp.ts';
export * from './money.ts';
export * from './pricing.ts';
export * from './eta.ts';
export * from './matching.ts';
