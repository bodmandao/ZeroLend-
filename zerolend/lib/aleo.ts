export const PROGRAM_ID   = 'lending_pool.aleo';
export const NETWORK      = 'testnet';
export const API_URL      = 'https://api.explorer.provable.com/v1';
export const ORG_ID       = '1field';

// ── Tier definitions  ──────────────
export const TIERS = {
  1: { label: 'Poor',      color: '#ef4444', maxLoan: 10,    rate: 20, minScore: 0   },
  2: { label: 'Fair',      color: '#f59e0b', maxLoan: 50,    rate: 15, minScore: 300 },
  3: { label: 'Good',      color: '#3b82f6', maxLoan: 200,   rate: 10, minScore: 500 },
  4: { label: 'Great',     color: '#10b981', maxLoan: 1000,  rate: 7,  minScore: 700 },
  5: { label: 'Excellent', color: '#00d4ff', maxLoan: 5000,  rate: 4,  minScore: 850 },
};

// ── Score calculation (mirrors Leo logic exactly) ─────────────
export function computeCreditScore(
  walletAgeDays:  number,
  repaymentsMade: number,
  defaults:       number,
  totalVolume:    number  // microcredits
): number {
  const agePts  = Math.min(walletAgeDays * 2, 200);
  const repPts  = Math.min(repaymentsMade * 10, 400);
  const volPts  = Math.min(Math.floor(totalVolume / 1_000_000), 200); // 1pt per ALEO
  const penalty = defaults * 100;
  const raw     = 200 + agePts + repPts + volPts;
  return Math.min(Math.max(raw - penalty, 0), 1000);
}

export function scoreToTier(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 850) return 5;
  if (score >= 700) return 4;
  if (score >= 500) return 3;
  if (score >= 300) return 2;
  return 1;
}

export function computeInterest(
  principal:  number,  // microcredits
  rateBps:    number,
  blocksHeld: number
): number {
  return Math.floor((principal * rateBps * blocksHeld) / 10_000_000);
}

// ── Unit helpers (microcredits ↔ ALEO) ────────────────────────
export function microToAleo(micro: number): number {
  return micro / 1_000_000;
}

export function aleoToMicro(aleo: number): number {
  return Math.floor(aleo * 1_000_000);
}

export function formatAleo(micro: number): string {
  return `${(micro / 1_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })} ALEO`;
}

export function formatAddress(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

export function getTierInfo(tier: number) {
  return TIERS[tier as keyof typeof TIERS] ?? TIERS[1];
}

// ── Field / nonce generators ──────────────────────────────────
export function randomField(): string {
  const n = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  return `${n}field`;
}

export function randomU32(): number {
  return Math.floor(Math.random() * 2_000_000);
}

// ── Wallet balance (from credits.aleo native mapping) ─────────
export async function getWalletBalance(address: string): Promise<number> {
  try {
    const res = await fetch(
      `${API_URL}/testnet/program/credits.aleo/mapping/account/${address}`
    );
    const data = await res.json();
    return parseInt(data ?? '0');
  } catch {
    return 0;
  }
}

// ── Transaction execution (via wallet adapter) ────────────────
export interface ExecuteParams {
  programId:    string;
  functionName: string;
  inputs:       string[];
  fee?:         number;
}

export async function executeTransaction(
  params: ExecuteParams,
  wallet: any  // injected from useWallet() hook
): Promise<string> {
  if (!wallet) throw new Error('Wallet not connected');

  const { programId, functionName, inputs, fee = 1_000_000 } = params;

  const txId = await wallet.requestTransaction({
    address:     wallet.publicKey,
    chainId:     'aleo:1',
    transitions: [{
      program:  programId,
      function: functionName,
      inputs,
    }],
    fee,
    feePrivate: false,
  });

  return txId;
}

// ── Mapping fetcher ───────────────────────────────────────────
export async function fetchMappingValue(
  program: string,
  mapping: string,
  key:     string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_URL}/testnet/program/${program}/mapping/${mapping}/${key}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Pool stats (keys are now 0u8, not TOKEN_ID field) ─────────
export async function fetchPoolStats() {
  try {
    const [liquidity, borrowed, interestEarned, loanCount] = await Promise.all([
      fetchMappingValue(PROGRAM_ID, 'pool_liquidity',       '0u8'),
      fetchMappingValue(PROGRAM_ID, 'pool_borrowed',        '0u8'),
      fetchMappingValue(PROGRAM_ID, 'pool_interest_earned', '0u8'),
      fetchMappingValue(PROGRAM_ID, 'active_loan_count',    '0u8'),
    ]);

    const tierCounts = await Promise.all(
      [1, 2, 3, 4, 5].map(t =>
        fetchMappingValue(PROGRAM_ID, 'aggregate_tier_count', `${t}u8`)
      )
    );

    const liq = parseInt(liquidity ?? '0');
    const bor = parseInt(borrowed  ?? '0');

    return {
      totalLiquidity:      liq,
      totalBorrowed:       bor,
      totalInterestEarned: parseInt(interestEarned ?? '0'),
      activeLoanCount:     parseInt(loanCount ?? '0'),
      utilizationRate:     liq > 0 ? Math.round((bor / liq) * 100) : 0,
      tier1Count: parseInt(tierCounts[0] ?? '0'),
      tier2Count: parseInt(tierCounts[1] ?? '0'),
      tier3Count: parseInt(tierCounts[2] ?? '0'),
      tier4Count: parseInt(tierCounts[3] ?? '0'),
      tier5Count: parseInt(tierCounts[4] ?? '0'),
    };
  } catch {
    return null;
  }
}

// ── Leo record string builders ────────────────────────────────

/**
 * credits.aleo native credits record.
 * Used as input to deposit / request_loan / repay_loan / withdraw.
 */
export function buildCreditsRecord(
  owner:         string,
  microcredits:  number
): string {
  return `{owner: ${owner}, microcredits: ${microcredits}u64}`;
}

/**
 * CreditRecord — private, owner-only visible.
 * total_volume is u64 (microcredits) now.
 */
export function buildCreditRecord(
  owner:          string,
  walletAgeDays:  number,
  repaymentsMade: number,
  defaults:       number,
  totalVolume:    number,  // microcredits u64
  currentScore:   number,
  lastUpdated:    number,
  nonce:          string
): string {
  return [
    `{owner: ${owner}`,
    `wallet_age_days: ${walletAgeDays}u32`,
    `repayments_made: ${repaymentsMade}u32`,
    `defaults: ${defaults}u32`,
    `total_volume: ${totalVolume}u64`,   // u64 — matches credits.aleo
    `current_score: ${currentScore}u32`,
    `last_updated: ${lastUpdated}u32`,
    `nonce: ${nonce}}`,
  ].join(', ');
}

/**
 * CreditTierProof — reveals only tier, not raw data.
 */
export function buildTierProof(
  owner:     string,
  tier:      number,
  orgId:     string,
  expiresAt: number,
  nonce:     string
): string {
  return `{owner: ${owner}, tier: ${tier}u8, org_id: ${orgId}, expires_at: ${expiresAt}u32, nonce: ${nonce}}`;
}

/**
 * LoanRecord — private, held by borrower.
 * No token_id field. principal / interest_rate are u64.
 */
export function buildLoanRecord(
  owner:         string,
  loanId:        string,
  principal:     number,   // microcredits u64
  interestRate:  number,   // bps u64
  borrowedBlock: number,
  dueBlock:      number,
  tier:          number,
  nonce:         string
): string {
  return [
    `{owner: ${owner}`,
    `loan_id: ${loanId}`,
    `principal: ${principal}u64`,        // u64, no token_id
    `interest_rate: ${interestRate}u64`,
    `borrowed_block: ${borrowedBlock}u32`,
    `due_block: ${dueBlock}u32`,
    `tier_at_borrow: ${tier}u8`,
    `nonce: ${nonce}}`,
  ].join(', ');
}

/**
 * LenderDeposit receipt — private, held by lender.
 * No token_id field. deposited_amount is u64.
 */
export function buildLenderDeposit(
  owner:        string,
  amount:       number,   // microcredits u64
  depositBlock: number,
  nonce:        string
): string {
  return [
    `{owner: ${owner}`,
    `deposited_amount: ${amount}u64`,    // u64, no token_id
    `deposit_block: ${depositBlock}u32`,
    `nonce: ${nonce}}`,
  ].join(', ');
}

/**
 * OracleAttestation — private, sent to user by oracle.
 * total_volume is u64 (microcredits).
 */
export function buildOracleAttestation(
  owner:          string,
  attester:       string,
  walletAgeDays:  number,
  repaymentsMade: number,
  defaults:       number,
  totalVolume:    number,  // microcredits u64
  validUntil:     number,
  attestationId:  string
): string {
  return [
    `{owner: ${owner}`,
    `attester: ${attester}`,
    `wallet_age_days: ${walletAgeDays}u32`,
    `repayments_made: ${repaymentsMade}u32`,
    `defaults: ${defaults}u32`,
    `total_volume: ${totalVolume}u64`,   // u64
    `valid_until: ${validUntil}u32`,
    `attestation_id: ${attestationId}}`,
  ].join(', ');
}