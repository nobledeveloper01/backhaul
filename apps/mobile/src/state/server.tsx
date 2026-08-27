import { useCallback, useEffect, useState } from 'react';

import type { ApiFailure, ApiResult } from '../api/client';

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
