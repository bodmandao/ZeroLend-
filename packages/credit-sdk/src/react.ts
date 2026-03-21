/**
 * @zerolend/credit-sdk/react
 *
 * Optional React hooks — import from '@zerolend/credit-sdk/react'
 * Requires React 16.8+ as a peer dependency.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ZeroLendClient,
  CreditPassport,
  TierCheckResult,
  PoolStats,
  FlashLoanStats,
  CreditTier,
  ZeroLendClientOptions,
} from './index';

// ── Shared singleton client ───────────────────────────────────

let _defaultClient: ZeroLendClient | null = null;

function getDefaultClient(): ZeroLendClient {
  if (!_defaultClient) _defaultClient = new ZeroLendClient();
  return _defaultClient;
}

// ── usePassport ───────────────────────────────────────────────

export interface UsePassportResult {
  passport:  CreditPassport | null;
  loading:   boolean;
  error:     string | null;
  refetch:   () => void;
}

/**
 * React hook to fetch and reactively display a Credit Passport.
 *
 * @example
 * function Profile({ address }: { address: string }) {
 *   const { passport, loading } = usePassport(address);
 *   if (loading) return <Spinner />;
 *   if (!passport?.published) return <p>No passport</p>;
 *   return <TierBadge tier={passport.tier} />;
 * }
 */
export function usePassport(
  address: string | null | undefined,
  options?: ZeroLendClientOptions,
): UsePassportResult {
  const [passport, setPassport] = useState<CreditPassport | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const clientRef = useRef(options ? new ZeroLendClient(options) : getDefaultClient());

  const fetch = useCallback(async () => {
    if (!address) { setPassport(null); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await clientRef.current.getPassport(address);
      setPassport(result);
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch passport');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { fetch(); }, [fetch]);

  return { passport, loading, error, refetch: fetch };
}

// ── useTierCheck ─────────────────────────────────────────────

export interface UseTierCheckResult {
  result:   TierCheckResult | null;
  loading:  boolean;
  error:    string | null;
  refetch:  () => void;
}

/**
 * React hook to check whether an address meets a minimum tier.
 * Use this to conditionally render features requiring credit verification.
 *
 * @example
 * function BorrowButton({ address }: { address: string }) {
 *   const { result } = useTierCheck(address, 3); // require Gold+
 *   return (
 *     <button disabled={!result?.passes}>
 *       {result?.passes ? 'Borrow' : result?.reason}
 *     </button>
 *   );
 * }
 */
export function useTierCheck(
  address:  string | null | undefined,
  minTier:  CreditTier,
  options?: ZeroLendClientOptions,
): UseTierCheckResult {
  const [result,  setResult]  = useState<TierCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const clientRef = useRef(options ? new ZeroLendClient(options) : getDefaultClient());

  const fetch = useCallback(async () => {
    if (!address) { setResult(null); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await clientRef.current.requireTier(address, minTier);
      setResult(r);
    } catch (e: any) {
      setError(e.message ?? 'Failed to check tier');
    } finally {
      setLoading(false);
    }
  }, [address, minTier]);

  useEffect(() => { fetch(); }, [fetch]);

  return { result, loading, error, refetch: fetch };
}

// ── usePoolStats ─────────────────────────────────────────────

export interface UsePoolStatsResult {
  stats:    PoolStats | null;
  loading:  boolean;
  error:    string | null;
  refetch:  () => void;
}

/**
 * React hook to fetch live pool statistics.
 * Optionally auto-refreshes on an interval.
 *
 * @example
 * function PoolDashboard() {
 *   const { stats } = usePoolStats({ refreshInterval: 30_000 });
 *   return <p>Utilization: {stats?.utilizationRate}%</p>;
 * }
 */
export function usePoolStats(opts?: {
  refreshInterval?: number;
  clientOptions?:   ZeroLendClientOptions;
}): UsePoolStatsResult {
  const [stats,   setStats]   = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const clientRef = useRef(
    opts?.clientOptions ? new ZeroLendClient(opts.clientOptions) : getDefaultClient()
  );

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await clientRef.current.getPoolStats();
      setStats(s);
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch pool stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    if (opts?.refreshInterval) {
      const id = setInterval(fetch, opts.refreshInterval);
      return () => clearInterval(id);
    }
  }, [fetch, opts?.refreshInterval]);

  return { stats, loading, error, refetch: fetch };
}

// ── useFlashLoanStats ─────────────────────────────────────────

export interface UseFlashLoanStatsResult {
  stats:    FlashLoanStats | null;
  loading:  boolean;
  error:    string | null;
  refetch:  () => void;
}

/**
 * React hook to fetch flash loan statistics.
 */
export function useFlashLoanStats(options?: ZeroLendClientOptions): UseFlashLoanStatsResult {
  const [stats,   setStats]   = useState<FlashLoanStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const clientRef = useRef(options ? new ZeroLendClient(options) : getDefaultClient());

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await clientRef.current.getFlashLoanStats();
      setStats(s);
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch flash loan stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { stats, loading, error, refetch: fetch };
}