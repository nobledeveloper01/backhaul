import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BackhaulApi, DEFAULT_BASE_URL, type SignedIn } from '@backhaul/api';

/**
 * Who is signed in, and the client that carries their token.
 *
 * The token is kept in `AsyncStorage`, which on both platforms is
 * unencrypted — the phone's own lock screen is the protection. That is a
 * deliberate and limited choice: the alternative is the Keychain and Android's
 * `EncryptedSharedPreferences`, another native dependency for a token that is
 * already scoped to one person's own trips and expires in ninety days. It is
 * written down here rather than assumed, because "where is the token" is the
 * first question anybody asks about this file.
 */
const TOKEN_KEY = 'backhaul.token.v1';
const WHO_KEY = 'backhaul.who.v1';

export interface Session {
  readonly who: SignedIn | null;
  /** False until storage has been read. The app shows nothing decisive until then. */
  readonly ready: boolean;
  readonly api: BackhaulApi;
  readonly signIn: (signedIn: SignedIn) => void;
  readonly signOut: () => void;
}

const SessionContext = createContext<Session>({
  who: null,
  ready: false,
  api: new BackhaulApi(DEFAULT_BASE_URL, null),
  signIn: () => {},
  signOut: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [who, setWho] = useState<SignedIn | null>(null);
  const [ready, setReady] = useState(false);

  // One client for the app's life, its token swapped in place. A new instance
  // per sign-in would leave anything holding the old one talking to the server
  // as nobody.
  const api = useMemo(() => new BackhaulApi(DEFAULT_BASE_URL, null), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored_ = await AsyncStorage.getMany([TOKEN_KEY, WHO_KEY]);
        const token = stored_[TOKEN_KEY] ?? null;
        const stored = stored_[WHO_KEY] ?? null;

        if (!cancelled && token !== null && stored !== null) {
          api.setToken(token);
          setWho(JSON.parse(stored) as SignedIn);
        }
      } catch {
        // Unreadable storage means signing in again, which is a nuisance
        // rather than a failure. Starting is more important than restoring.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const signIn = useCallback(
    (signedIn: SignedIn) => {
      api.setToken(signedIn.token);
      setWho(signedIn);
      // Fire and forget: the session is already live on screen, and a failed
      // write costs one more sign-in rather than anything irrecoverable.
      void AsyncStorage.setMany({
        [TOKEN_KEY]: signedIn.token,
        [WHO_KEY]: JSON.stringify(signedIn),
      }).catch(() => {});
    },
    [api],
  );

  const signOut = useCallback(() => {
    api.setToken(null);
    setWho(null);
    void AsyncStorage.removeMany([TOKEN_KEY, WHO_KEY]).catch(() => {});
  }, [api]);

  /*
    A token the server no longer knows is a signed-out session that has not
    noticed yet.

    Without this the app sits on the trips screen showing "this endpoint needs
    a bearer token" — the server's own words, in English, with a Try again
    button that sends the same dead token. Every error path has a forward path,
    and the forward path here is the sign-in screen.

    It happens for real: a token expires after ninety days, and a
    demonstration server keeps its tokens in memory and forgets them all when
    it restarts.
  */
  useEffect(() => {
    api.onUnauthorised = signOut;
    return () => {
      api.onUnauthorised = null;
    };
  }, [api, signOut]);

  const value = useMemo<Session>(
    () => ({ who, ready, api, signIn, signOut }),
    [who, ready, api, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
