import { useCallback, useState } from 'react';

import type { DemoTrip } from '../state/demo';

/**
 * Every screen this app can be on.
 *
 * A discriminated union rather than a route string, so a screen that needs a
 * trip cannot be pushed without one. The alternative — what this replaced —
 * was a `face` plus one boolean per screen in `App`, which was tolerable at
 * four screens and became a five-way `if` ladder at fourteen.
 */
export type Route =
  | { readonly name: 'trips' }
  | { readonly name: 'trip'; readonly trip: DemoTrip }
  | { readonly name: 'share'; readonly trip: DemoTrip }
  | { readonly name: 'follow'; readonly trip: DemoTrip }
  | { readonly name: 'messages'; readonly trip: DemoTrip }
  | { readonly name: 'incident'; readonly trip: DemoTrip }
  | { readonly name: 'delivery'; readonly trip: DemoTrip }
  | { readonly name: 'pod'; readonly trip: DemoTrip }
  | { readonly name: 'review'; readonly trip: DemoTrip }
  | { readonly name: 'dispute'; readonly trip: DemoTrip }
  | { readonly name: 'cancel'; readonly trip: DemoTrip }
  | { readonly name: 'drops'; readonly trip: DemoTrip }
  | { readonly name: 'loads' }
  | { readonly name: 'post' }
  | { readonly name: 'chain' }
  | { readonly name: 'lanes' }
  | { readonly name: 'pairs' }
  | { readonly name: 'fleet' }
  | { readonly name: 'bids' }
  | { readonly name: 'verification' }
  | { readonly name: 'vehicles' }
  | { readonly name: 'alerts' }
  | { readonly name: 'driver' }
  | { readonly name: 'history' }
  | { readonly name: 'driver-report'; readonly trip: DemoTrip }
  | { readonly name: 'driver-delivery'; readonly trip: DemoTrip }
  | { readonly name: 'levies'; readonly trip: DemoTrip };

export type Face = 'shipper' | 'loads' | 'fleet' | 'driver';

export const ROOT: Readonly<Record<Face, Route>> = {
  shipper: { name: 'trips' },
  loads: { name: 'loads' },
  fleet: { name: 'fleet' },
  driver: { name: 'driver' },
} as const;

/**
 * One stack per face, and switching faces does not lose your place.
 *
 * Tapping a tab you are already on pops that face back to its root — the
 * behaviour every tabbed app has, and the one people reach for when they are
 * three screens deep and want out.
 */
export function useStacks() {
  const [face, setFace] = useState<Face>('shipper');
  const [stacks, setStacks] = useState<Readonly<Record<Face, readonly Route[]>>>({
    shipper: [ROOT.shipper],
    loads: [ROOT.loads],
    fleet: [ROOT.fleet],
    driver: [ROOT.driver],
  });

  const current = stacks[face].at(-1) ?? ROOT[face];
  const depth = stacks[face].length;

  const push = useCallback(
    (route: Route) => {
      setStacks((was) => ({ ...was, [face]: [...was[face], route] }));
    },
    [face],
  );

  const pop = useCallback(() => {
    setStacks((was) => {
      const stack = was[face];
      // Never pops the root away: a face with an empty stack has nothing to
      // render, and the failure mode is a blank screen with a tab bar.
      if (stack.length <= 1) return was;
      return { ...was, [face]: stack.slice(0, -1) };
    });
  }, [face]);

  const select = useCallback(
    (next: Face) => {
      if (next === face) {
        setStacks((was) => ({ ...was, [next]: [ROOT[next]] }));
        return;
      }
      setFace(next);
    },
    [face],
  );

  /** Replaces the whole stack. Used when a flow finishes and going "back" into
   * it would be wrong — a delivery that has been signed for, for instance. */
  const reset = useCallback(
    (route: Route) => {
      setStacks((was) => ({ ...was, [face]: [ROOT[face], route] }));
    },
    [face],
  );

  return { face, current, depth, push, pop, select, reset } as const;
}
