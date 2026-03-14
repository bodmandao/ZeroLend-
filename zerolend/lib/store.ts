

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TierLevel, PoolStats } from '../types';

// ── Wallet state (not persisted) ──────────────────────────────
export interface WalletState {
  connected:  boolean;
  address:    string | null;
  publicKey:  string | null;
  balance:    number; // microcredits
}

// ── Store shape ───────────────────────────────────────────────
interface ZeroLendStore {
  // Wallet — reset on every page load (wallet must reconnect)
  wallet: WalletState;
  setWallet: (w: Partial<WalletState>) => void;
  resetWallet: () => void;

  // Credit — persisted: survives refresh
  creditScore:  number | null;
  creditTier:   TierLevel | null;
  creditRecord: Record<string, string> | null;
  tierProof:    string | null;
  setCreditRecord: (rec: Record<string, string>, score: number, tier: TierLevel) => void;
  setTierProof:    (proof: string) => void;
  clearCredit:     () => void;

  // Pool stats — not persisted (fetched fresh)
  poolStats: PoolStats | null;
  setPoolStats: (s: PoolStats) => void;

  // Loans & deposits (local optimistic state — not persisted, re-fetched from DB)
  loans:    any[];
  deposits: any[];
  addLoan:    (loan: any)    => void;
  addDeposit: (deposit: any) => void;

  // Transaction history (not persisted)
  transactions: any[];
  addTransaction: (tx: any) => void;
}

const DEFAULT_WALLET: WalletState = {
  connected: false,
  address:   null,
  publicKey: null,
  balance:   0,
};

export const useStore = create<ZeroLendStore>()(
  persist(
    (set) => ({
      // ── Wallet ──────────────────────────────────────────────
      wallet: DEFAULT_WALLET,
      setWallet:  (w) => set((s) => ({ wallet: { ...s.wallet, ...w } })),
      resetWallet: () => set({ wallet: DEFAULT_WALLET }),

      // ── Credit ──────────────────────────────────────────────
      creditScore:  null,
      creditTier:   null,
      creditRecord: null,
      tierProof:    null,

      setCreditRecord: (rec, score, tier) =>
        set({ creditRecord: rec, creditScore: score, creditTier: tier }),

      setTierProof: (proof) => set({ tierProof: proof }),

      clearCredit: () =>
        set({ creditScore: null, creditTier: null, creditRecord: null, tierProof: null }),

      // ── Pool stats ───────────────────────────────────────────
      poolStats:    null,
      setPoolStats: (s) => set({ poolStats: s }),

      // ── Loans & deposits ─────────────────────────────────────
      loans:    [],
      deposits: [],
      addLoan:    (loan)    => set((s) => ({ loans:    [loan,    ...s.loans]    })),
      addDeposit: (deposit) => set((s) => ({ deposits: [deposit, ...s.deposits] })),

      // ── Transactions ─────────────────────────────────────────
      transactions: [],
      addTransaction: (tx) => set((s) => ({ transactions: [tx, ...s.transactions] })),
    }),
    {
      name: 'zerolend-store',
      storage: createJSONStorage(() => localStorage),
      // Only persist credit state — everything else is transient or re-fetched
      partialize: (state) => ({
        creditScore:  state.creditScore,
        creditTier:   state.creditTier,
        creditRecord: state.creditRecord,
        tierProof:    state.tierProof,
      }),
    }
  )
);