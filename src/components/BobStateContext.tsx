'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { ApiError, fetchState, type StateResponse } from '@/components/api';

interface BobStateContextValue {
  state: StateResponse | null;
  setState: Dispatch<SetStateAction<StateResponse | null>>;
  loading: boolean;
  /** Set once the first load finishes, true after any load. */
  loaded: boolean;
  error: string | null;
  /** False when the API itself could not be reached (network/404), not just a 4xx. */
  reachable: boolean;
  refetch: () => Promise<void>;
}

const BobStateContext = createContext<BobStateContextValue | null>(null);

export function BobStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reachable, setReachable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchState();
      setState(data);
      setReachable(true);
    } catch (e) {
      const apiError = e instanceof ApiError ? e : null;
      setReachable(apiError ? apiError.status !== 0 && apiError.status !== 404 : false);
      setError(e instanceof Error ? e.message : 'Something went wrong loading Bob.');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  // The initial fetch deliberately does not reuse `load`: `load` sets loading
  // state synchronously, and a synchronous setState in an effect body triggers
  // a cascading render (and React 16's hooks lint rejects it). `loading` and
  // `loaded` already start in the right state for a first load, so the only
  // updates here happen after the await.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const data = await fetchState();
        if (cancelled) return;
        setState(data);
        setReachable(true);
      } catch (e) {
        if (cancelled) return;
        const apiError = e instanceof ApiError ? e : null;
        setReachable(
          apiError ? apiError.status !== 0 && apiError.status !== 404 : false,
        );
        setError(e instanceof Error ? e.message : 'Something went wrong loading Bob.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <BobStateContext.Provider
      value={{ state, setState, loading, loaded, error, reachable, refetch: load }}
    >
      {children}
    </BobStateContext.Provider>
  );
}

export function useBobState(): BobStateContextValue {
  const ctx = useContext(BobStateContext);
  if (!ctx) throw new Error('useBobState must be used within a BobStateProvider');
  return ctx;
}
