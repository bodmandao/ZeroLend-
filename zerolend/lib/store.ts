import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  WalletState, PoolStats, CreditRecord,
  LoanRecord, LenderDeposit, TransactionStatus
} from '@/types';

interface ZeroLendStore {
  // Wallet
  wallet: WalletState;
  setWallet: (w: Partial<WalletState>) => void;
  disconnectWallet: () => void;

  // Pool
  poolStats: PoolStats | null;
  setPoolStats: (s: PoolStats) => void;

  // User credit
  creditRecord: CreditRecord | null;
  creditScore: number | null;
  creditTier: number | null;
  setCreditRecord: (r: CreditRecord, score: number, tier: number) => void;
  clearCreditRecord: () => void;

  // Tier proof (session only)
  tierProof: string | null;
  setTierProof: (p: string | null) => void;

  // Active loans
  activeLoans: LoanRecord[];
  setActiveLoans: (loans: LoanRecord[]) => void;
  addLoan: (loan: LoanRecord) => void;
  removeLoan: (loanId: string) => void;

  // Deposits
  deposits: LenderDeposit[];
  setDeposits: (deps: LenderDeposit[]) => void;
  addDeposit: (dep: LenderDeposit) => void;

  // Transactions
  transactions: TransactionStatus[];
  addTransaction: (tx: TransactionStatus) => void;
  updateTransaction: (id: string, update: Partial<TransactionStatus>) => void;

  // UI
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}

export const useStore = create<ZeroLendStore>()(
  persist(
    (set) => ({
      // Wallet
      wallet: { connected: false, address: null, publicKey: null, balance: 0 },
      setWallet: (w) =>
        set((s) => ({ wallet: { ...s.wallet, ...w } })),
      disconnectWallet: () =>
        set({
          wallet: { connected: false, address: null, publicKey: null, balance: 0 },
          creditRecord: null,
          creditScore: null,
          creditTier: null,
          tierProof: null,
          activeLoans: [],
          deposits: [],
        }),

      // Pool
      poolStats: null,
      setPoolStats: (s) => set({ poolStats: s }),

      // Credit
      creditRecord: null,
      creditScore: null,
      creditTier: null,
      setCreditRecord: (r, score, tier) =>
        set({ creditRecord: r, creditScore: score, creditTier: tier }),
      clearCreditRecord: () =>
        set({ creditRecord: null, creditScore: null, creditTier: null }),

      // Tier proof
      tierProof: null,
      setTierProof: (p) => set({ tierProof: p }),

      // Loans
      activeLoans: [],
      setActiveLoans: (loans) => set({ activeLoans: loans }),
      addLoan: (loan) =>
        set((s) => ({ activeLoans: [...s.activeLoans, loan] })),
      removeLoan: (loanId) =>
        set((s) => ({
          activeLoans: s.activeLoans.filter((l) => l.loan_id !== loanId),
        })),

      // Deposits
      deposits: [],
      setDeposits: (deps) => set({ deposits: deps }),
      addDeposit: (dep) =>
        set((s) => ({ deposits: [...s.deposits, dep] })),

      // Transactions
      transactions: [],
      addTransaction: (tx) =>
        set((s) => ({ transactions: [tx, ...s.transactions.slice(0, 49)] })),
      updateTransaction: (id, update) =>
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id ? { ...t, ...update } : t
          ),
        })),

      // UI
      sidebarOpen: false,
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
    }),
    {
      name: 'zerolend-store',
      partialize: (s) => ({
        wallet: s.wallet,
        creditRecord: s.creditRecord,
        creditScore: s.creditScore,
        creditTier: s.creditTier,
        activeLoans: s.activeLoans,
        deposits: s.deposits,
      }),
    }
  )
);
