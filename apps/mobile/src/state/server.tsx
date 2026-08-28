import { useCallback, useEffect, useState } from 'react';

import type { ApiFailure, ApiResult } from '@backhaul/api';

/**
 * What a screen knows about a request that has not finished.
 *
 * Four states, not two. `loading` and `ready` are the pair everybody writes;
 * the other two are the pair that decides whether a screen tells the truth.
 *
 * **`unreachable` is not `empty`.** A shipper whose phone has no signal must
 * not be shown "no trips" — they have trips, and the app cannot see them. That
 * distinction is the same one `observe()` makes between *stopped* and
 * *unknown*, and it is the seventh of the things this product never trades.
 */
export type Query<T> =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly value: T }
  | { readonly state: 'refused'; readonly failure: ApiFailure }
  | { readonly state: 'unreachable' };

/**
 * Runs a request and keeps its outcome.
 *
 * Deliberately small. There is no cache, no deduplication and no retry: a
 * refresh is a pull-to-refresh a person asked for, and a silent retry against
 * a Nigerian network is a request that fires forty times on one bad stretch of
 * road and spends somebody's airtime doing it.
 */
export function useQuery<T>(
  run: () => Promise<ApiResult<T>>,
  deps: readonly unknown[],
): { readonly query: Query<T>; readonly refresh: () => void } {
  const [query, setQuery] = useState<Query<T>>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);

  /*
    The caller's `deps` decide when this re-runs, not the identity of `run`.

    Every call site passes an arrow function, so `run` is a new value on every
    render and depending on it would fire the request on every render — which
    on a Nigerian network is a request per keystroke in a search field.
  */
  const call = useCallback(run, deps);

  useEffect(() => {
    let cancelled = false;

    setQuery({ state: 'loading' });

    void call().then((result) => {
      if (cancelled) return;

      if (result.ok) {
        setQuery({ state: 'ready', value: result.value });
        return;
      }

      setQuery(
        result.failure.kind === 'unreachable'
          ? { state: 'unreachable' }
          : { state: 'refused', failure: result.failure },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [call, nonce]);

  const refresh = useCallback(() => setNonce((was) => was + 1), []);

  return { query, refresh };
}

/**
 * Why a list is empty, in a sentence.
 *
 * Not a helper for convenience — a guard. The three empty screens a person can
 * meet are *nothing yet*, *nothing matching* and *cannot see*, and only the
 * first two are about their data. Collapsing them into "no trips" tells a
 * shipper on a bad connection that their trucks have disappeared.
 */
export type Emptiness = 'loading' | 'unreachable' | 'refused' | 'none' | 'filtered';

export function emptiness<T>(
  query: Query<readonly T[]>,
  shown: number,
  filtering: boolean,
): Emptiness | null {
  if (query.state === 'loading') return 'loading';
  if (query.state === 'unreachable') return 'unreachable';
  if (query.state === 'refused') return 'refused';
  if (shown > 0) return null;
  return filtering ? 'filtered' : 'none';
}

/**
 * Server when the trip is real, walkthrough when it is not.
 *
 * Every screen behind a trip needs the same three lines: fetch when there is
 * something to fetch, render the walkthrough when there is not, and never
 * confuse the two. Written once here rather than twenty times, because the
 * version that gets written twenty times is the version where three of them
 * quietly render demo data as though it were a shipper's own.
 *
 * `live` is a field on the trip rather than a guess from its id. See `DemoTrip`.
 */
export function useTripData<T>(
  live: boolean,
  fetch: () => Promise<ApiResult<T>>,
  walkthrough: () => T,
  deps: readonly unknown[],
): { readonly query: Query<T>; readonly refresh: () => void } {
  return useQuery(
    // Wrapped rather than branched at the call site, so a screen cannot get
    // half of this right.
    () => (live ? fetch() : Promise.resolve<ApiResult<T>>({ ok: true, value: walkthrough() })),
    [live, ...deps],
  );
}

/**
 * A read that has nothing to fall back on.
 *
 * The trip screens can render the walkthrough when the server has no trip.
 * These cannot: a verification tier, a fleet's papers, a driver's statement
 * and the alerts are all facts about the person signed in, and there is no
 * honest walkthrough of somebody's own record. So the screen renders what the
 * server said, or says it could not read it.
 *
 * Thin on purpose — it is `useQuery` with a name that says why there is no
 * second argument.
 */
export function useMine<T>(
  fetch: () => Promise<ApiResult<T>>,
  deps: readonly unknown[],
): { readonly query: Query<T>; readonly refresh: () => void } {
  return useQuery(fetch, deps);
}
