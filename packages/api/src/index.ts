/**
 * The wire, in one place.
 *
 * This was `apps/mobile/src/api/client.ts` — 1,960 lines that import nothing
 * from React Native and never did. It was platform-free the whole time and
 * simply lived somewhere only one face could reach, so a second face had the
 * choice of importing across an app boundary or writing the wire again.
 *
 * A second implementation of the wire is the same mistake ADR-0005 forbids for
 * a rule, one layer out: two clients agree on most requests, disagree on the
 * ones nobody tested, and the disagreement is a screen that works on a phone
 * and not on a desktop for a reason no single file explains.
 */
export * from './client.ts';
