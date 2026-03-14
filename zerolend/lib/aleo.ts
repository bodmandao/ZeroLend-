export const PROGRAM_ID = 'zerolend_lending_pool_v2.aleo';
export const NETWORK    = 'testnet';
export const API_URL    = 'https://api.explorer.provable.com/v2';
export const ORG_ID     = '1field';

// ── Tier definitions ──────────────────────────────────────────
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
  const volPts  = Math.min(Math.floor(totalVolume / 1_000_000), 200);
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

// ── Unit helpers ──────────────────────────────────────────────
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

// ── Wallet balance ────────────────────────────────────────────
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

// ── Current block height ──────────────────────────────────────
export async function getCurrentBlockHeight(): Promise<number> {
  try {
    const res = await fetch(`${API_URL}/testnet/block/height/latest`);
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data === 'number' ? data : parseInt(data) || 0;
  } catch {
    return 0;
  }
}

// ── Transaction execution ─────────────────────────────────────
// executeHandler  = executeTransaction from useWallet()
// transactionStatus = transactionStatus from useWallet()
export interface ExecuteParams {
  programId:    string;
  functionName: string;
  inputs:       string[];
  fee?:         number;
  privateFee?:  boolean;
}

export async function executeTransaction(
  params:            ExecuteParams,
  executeHandler:    (p: any) => Promise<any>,
  transactionStatus: (id: string) => Promise<any>
): Promise<string> {
  if (!executeHandler) throw new Error('Wallet not connected');

  const { programId, functionName, inputs, fee = 200_000, privateFee = false } = params;

  console.log('[execute]', programId, functionName, inputs);

  // NOTE: wallet adapter uses `fee` in microcredits (not `priorityFee` in ALEO).
  // The official SDK's ProgramManager uses `priorityFee` in ALEO — that's only
  // used server-side in the oracle API route. These are two different APIs.
  const raw = await executeHandler({
    program:     programId,
    function:    functionName,
    inputs,
    fee,          // microcredits — wallet adapter field name
    privateFee,
  });

  console.log('[execute] raw response:', raw);

  const tempTxId: string = typeof raw === 'string' ? raw : raw?.transactionId;
  if (!tempTxId) throw new Error('No transaction ID returned from wallet');

  const finalTxId = await pollTransaction(tempTxId, transactionStatus);
  return finalTxId;
}

// ── Poll until Accepted ───────────────────────────────────────
export function pollTransaction(
  tempTxId:          string,
  transactionStatus: (id: string) => Promise<any>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const status = await transactionStatus?.(tempTxId);
        if (!status) return;

        console.log(`[poll] ${tempTxId}:`, status.status);

        if (status.status === 'Accepted' && status.transactionId) {
          clearInterval(interval);
          resolve(status.transactionId);
        } else if (status.status !== 'pending') {
          clearInterval(interval);
          reject(new Error(`Transaction ${status.status ?? 'failed'}`));
        }
      } catch (err) {
        clearInterval(interval);
        reject(err);
      }
    }, 2000);
  });
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

// ── Pool stats ────────────────────────────────────────────────
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

export function buildCreditsRecord(owner: string, microcredits: number): string {
  return `{owner: ${owner}, microcredits: ${microcredits}u64}`;
}

export function buildCreditRecord(
  owner:          string,
  walletAgeDays:  number,
  repaymentsMade: number,
  defaults:       number,
  totalVolume:    number,
  currentScore:   number,
  lastUpdated:    number,
  nonce:          string
): string {
  return [
    `{owner: ${owner}`,
    `wallet_age_days: ${walletAgeDays}u32`,
    `repayments_made: ${repaymentsMade}u32`,
    `defaults: ${defaults}u32`,
    `total_volume: ${totalVolume}u64`,
    `current_score: ${currentScore}u32`,
    `last_updated: ${lastUpdated}u32`,
    `nonce: ${nonce}}`,
  ].join(', ');
}

export function buildTierProof(
  owner:     string,
  tier:      number,
  orgId:     string,
  expiresAt: number,
  nonce:     string
): string {
  return `{owner: ${owner}, tier: ${tier}u8, org_id: ${orgId}, expires_at: ${expiresAt}u32, nonce: ${nonce}}`;
}

export function buildLoanRecord(
  owner:         string,
  loanId:        string,
  principal:     number,
  interestRate:  number,
  borrowedBlock: number,
  dueBlock:      number,
  tier:          number,
  nonce:         string
): string {
  return [
    `{owner: ${owner}`,
    `loan_id: ${loanId}`,
    `principal: ${principal}u64`,
    `interest_rate: ${interestRate}u64`,
    `borrowed_block: ${borrowedBlock}u32`,
    `due_block: ${dueBlock}u32`,
    `tier_at_borrow: ${tier}u8`,
    `nonce: ${nonce}}`,
  ].join(', ');
}

export function buildLenderDeposit(
  owner:        string,
  amount:       number,
  depositBlock: number,
  nonce:        string
): string {
  return [
    `{owner: ${owner}`,
    `deposited_amount: ${amount}u64`,
    `deposit_block: ${depositBlock}u32`,
    `nonce: ${nonce}}`,
  ].join(', ');
}

export function buildOracleAttestation(
  owner:          string,
  attester:       string,
  walletAgeDays:  number,
  repaymentsMade: number,
  defaults:       number,
  totalVolume:    number,
  validUntil:     number,
  attestationId:  string
): string {
  return [
    `{owner: ${owner}`,
    `attester: ${attester}`,
    `wallet_age_days: ${walletAgeDays}u32`,
    `repayments_made: ${repaymentsMade}u32`,
    `defaults: ${defaults}u32`,
    `total_volume: ${totalVolume}u64`,
    `valid_until: ${validUntil}u32`,
    `attestation_id: ${attestationId}}`,
  ].join(', ');
}

// ── Fetch record ciphertext from a confirmed transaction ───────
// After executeTransaction returns a txId, call this to extract
// the record1q... ciphertext from the first record-type output.
// The caller then passes it to wallet.decrypt() to get plaintext.
export async function fetchRecordCiphertextFromTx(
  txId:        string,
  recordName?: string,   // optional: verify it's the right record type
): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/testnet/transaction/${txId}`);
    if (!res.ok) return null;
    const tx = await res.json();

    // Walk execution → transitions → outputs, find first record type
    const transitions: any[] = tx?.execution?.transitions ?? [];
    for (const t of transitions) {
      // Skip credits.aleo fee transition
      if (t.program === 'credits.aleo') continue;

      for (const output of (t.outputs ?? [])) {
        if (output.type === 'record' && typeof output.value === 'string') {
          return output.value; // record1q...
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Poll until a tx is confirmed, then return its record ciphertext ─
// Useful right after executeTransaction when the tx may not yet be indexed.
export async function waitForRecordCiphertext(
  txId:          string,
  maxAttempts  = 20,
  intervalMs   = 5_000,
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const cipher = await fetchRecordCiphertextFromTx(txId);
    if (cipher) return cipher;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}