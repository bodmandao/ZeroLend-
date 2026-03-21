
export interface AleoRecord {
  owner: string;
  [key: string]: unknown;
}

export interface CreditsRecord extends AleoRecord {
  microcredits: string;  
}

// ── Protocol records ──────────────────────────────────────────

export interface CreditRecord extends AleoRecord {
  wallet_age_days: string;
  repayments_made: string;
  defaults:        string;
  total_volume:    string;  
  current_score:   string;
  last_updated:    string;
  nonce:           string;
}

export interface CreditTierProof extends AleoRecord {
  tier:       string;
  org_id:     string;
  expires_at: string;
  nonce:      string;
}

export interface LoanRecord extends AleoRecord {
  loan_id:        string;
  principal:      string; 
  interest_rate:  string;  // u64 bps
  borrowed_block: string;
  due_block:      string;
  tier_at_borrow: string;
  nonce:          string;
}

export interface LenderDeposit extends AleoRecord {
  deposited_amount: string; 
  deposit_block:    string;
  nonce:            string;
}

export interface OracleAttestation extends AleoRecord {
  attester:        string;
  wallet_age_days: string;
  repayments_made: string;
  defaults:        string;
  total_volume:    string; 
  valid_until:     string;
  attestation_id:  string;
}

// ── UI State types ────────────────────────────────────────────

export type TierLevel = 1 | 2 | 3 | 4 | 5;

export interface TierInfo {
  level:       TierLevel;
  label:       string;
  color:       string;
  maxLoan:     number;   
  rate:        number;   // APR %
  description: string;
}

export interface PoolStats {
  totalLiquidity:      number;  // microcredits
  totalBorrowed:       number;  // microcredits
  totalInterestEarned: number;  // microcredits
  activeLoanCount:     number;
  utilizationRate:     number;  // 0–100
  tier1Count:          number;
  tier2Count:          number;
  tier3Count:          number;
  tier4Count:          number;
  tier5Count:          number;
}

export interface TransactionStatus {
  id:        string;
  type:      string;
  status:    'pending' | 'proving' | 'broadcasting' | 'confirmed' | 'failed';
  message:   string;
  txId?:     string;
  timestamp: number;
}

export interface WalletState {
  connected:  boolean;
  address:    string | null;
  publicKey:  string | null;
  balance:    number;  // microcredits from credits.aleo/account mapping
}

// ── Supabase DB types ─────────────────────────────────────────

export interface DbLoan {
  id:               string;
  borrower_address: string;
  loan_id_field:    string;
  principal:        number;  
  interest_rate:    number;  // bps
  tier:             number;
  borrowed_at:      string;
  due_at_block:     number;
  status:           'active' | 'repaid' | 'liquidated';
  tx_id:            string;
  repaid_tx_id?:    string;
  created_at:       string;
}

export interface DbDeposit {
  id:             string;
  lender_address: string;
  amount:         number;  
  deposit_block:  number;
  deposit_nonce:  string;
  status:         'active' | 'withdrawn';
  tx_id:          string;
  created_at:     string;
}

export interface DbCreditAttestation {
  id:              string;
  user_address:    string;
  attestation_id:  string;
  wallet_age_days: number;
  repayments_made: number;
  defaults:        number;
  total_volume:    number;  
  computed_score:  number;
  tier:            number;
  redeemed:        boolean;
  created_at:      string;
}