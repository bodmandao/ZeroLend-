// ================================================================
// @zerolend/credit-sdk — Core Types
// ================================================================

/** Credit tier levels (1 = Bronze … 5 = Diamond) */
export type CreditTier = 1 | 2 | 3 | 4 | 5;

/** Supported lending pools */
export type TokenPool = 'aleo' | 'usdcx' | 'usad';

/** Human-readable tier metadata */
export interface TierInfo {
  tier:         CreditTier;
  label:        'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
  minScore:     number;
  maxLoanAleo:  number;   // maximum loan in ALEO
  maxLoanUsdcx: number;   // maximum loan in USDCx (USD value)
  maxLoanUsad:  number;   // maximum loan in USAD (USD value)
  rateApr:      number;   // ALEO pool annual interest rate %
  rateAprUsdcx: number;   // USDCx pool annual interest rate %
  rateAprUsad:  number;   // USAD pool annual interest rate %
  color:        string;   // hex color for UI
}

/** A published Credit Passport entry read from chain */
export interface CreditPassport {
  /** Aleo wallet address */
  address:     string;
  /** Published tier (1-5). Null if no passport published. */
  tier:        CreditTier | null;
  /** Block height when passport was last updated */
  updatedAt:   number;
  /** Whether a passport is currently published */
  published:   boolean;
}

/** Result of a tier requirement check */
export interface TierCheckResult {
  /** Whether the address meets the requirement */
  passes:       boolean;
  /** The address's actual tier (null if no passport) */
  actualTier:   CreditTier | null;
  /** The required minimum tier */
  requiredTier: CreditTier;
  /** Human-readable reason */
  reason:       string;
}

/** Options for ZeroLendClient */
export interface ZeroLendClientOptions {
  /**
   * Aleo API base URL.
   * @default "https://api.explorer.provable.com/v2"
   */
  apiUrl?:           string;
  /**
   * Aleo network (testnet | mainnet).
   * @default "testnet"
   */
  network?:          'testnet' | 'mainnet';
  /**
   * Override program IDs for any pool.
   * Defaults to the canonical deployed program IDs.
   */
  programIds?: {
    aleo?:  string;
    usdcx?: string;
    usad?:  string;
  };
}

/** Flash loan statistics from chain */
export interface FlashLoanStats {
  totalFeesEarned: number;  // base units
  totalLoansCount: number;
}

/** Pool statistics from chain */
export interface PoolStats {
  totalLiquidity:  number;  // base units
  totalBorrowed:   number;  // base units
  interestEarned:  number;  // base units
  activeLoanCount: number;
  utilizationRate: number;  // 0-100
}

/** Oracle status for a single slot */
export interface OracleSlot {
  slot:       number;
  address:    string | null;
  slashCount: number;
}

/** Active vouch details */
export interface VouchInfo {
  voucher:     string;
  borrower:    string;
  staked:      number;  // microcredits
  issuedBlock: number;
  boostedTier: number;  // borrower's current boosted tier (0 = none)
}

/** Governance proposal summary */
export interface ProposalSummary {
  id:         string;   // hex field
  proposer:   string;
  startBlock: number;
  endBlock:   number;
  yesWeight:  number;
  noWeight:   number;
  executed:   boolean;
}

// ================================================================
// Constants
// ================================================================

export const PROGRAM_ID       = 'zerolend_lending_pool_v4.aleo';
export const PROGRAM_ID_USDCX = 'zerolend_usdcx_v1.aleo';
export const PROGRAM_ID_USAD  = 'zerolend_usad_v1.aleo';

// Underlying stablecoin programs on Aleo testnet
export const USDCX_TOKEN_PROGRAM  = 'test_usdcx_stablecoin.aleo';
export const USAD_TOKEN_PROGRAM   = 'test_usad_stablecoin.aleo';

// Supporting ZeroLend programs
export const PROGRAM_ID_ORACLE     = 'zerolend_oracle_v1.aleo';
export const PROGRAM_ID_VOUCHING   = 'zerolend_vouching_v1.aleo';
export const PROGRAM_ID_GOVERNANCE = 'zerolend_governance_v1.aleo';

export const DEFAULT_API_URL = 'https://api.explorer.provable.com/v2';

export const TIER_INFO: Record<CreditTier, TierInfo> = {
  1: { tier: 1, label: 'Bronze',   minScore: 0,   maxLoanAleo: 10,   maxLoanUsdcx: 10,   maxLoanUsad: 10,   rateApr: 20, rateAprUsdcx: 15, rateAprUsad: 18, color: '#ef4444' },
  2: { tier: 2, label: 'Silver',   minScore: 300, maxLoanAleo: 50,   maxLoanUsdcx: 50,   maxLoanUsad: 50,   rateApr: 15, rateAprUsdcx: 11, rateAprUsad: 13, color: '#f59e0b' },
  3: { tier: 3, label: 'Gold',     minScore: 500, maxLoanAleo: 200,  maxLoanUsdcx: 200,  maxLoanUsad: 200,  rateApr: 10, rateAprUsdcx: 8,  rateAprUsad: 10, color: '#3b82f6' },
  4: { tier: 4, label: 'Platinum', minScore: 700, maxLoanAleo: 1000, maxLoanUsdcx: 1000, maxLoanUsad: 1000, rateApr: 7,  rateAprUsdcx: 5,  rateAprUsad: 6,  color: '#10b981' },
  5: { tier: 5, label: 'Diamond',  minScore: 850, maxLoanAleo: 5000, maxLoanUsdcx: 5000, maxLoanUsad: 5000, rateApr: 4,  rateAprUsdcx: 3,  rateAprUsad: 4,  color: '#00d4ff' },
};

export const MICROCREDITS_PER_ALEO = 1_000_000;

// ================================================================
// ZeroLendClient
// ================================================================

export class ZeroLendClient {
  private apiUrl:     string;
  private network:    string;
  private programIds: Record<TokenPool, string>;

  constructor(options: ZeroLendClientOptions = {}) {
    this.apiUrl  = options.apiUrl  ?? DEFAULT_API_URL;
    this.network = options.network ?? 'testnet';
    this.programIds = {
      aleo:  options.programIds?.aleo  ?? PROGRAM_ID,
      usdcx: options.programIds?.usdcx ?? PROGRAM_ID_USDCX,
      usad:  options.programIds?.usad  ?? PROGRAM_ID_USAD,
    };
  }

  // ── Internal helpers ─────────────────────────────────────────

  private async fetchMappingFromProgram(programId: string, mapping: string, key: string): Promise<string | null> {
    try {
      const url = `${this.apiUrl}/${this.network}/program/${programId}/mapping/${mapping}/${key}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw = await res.json();
      if (typeof raw === 'string') return raw.replace(/^"|"$/g, '');
      return String(raw);
    } catch {
      return null;
    }
  }

  private async fetchMapping(mapping: string, key: string, pool: TokenPool = 'aleo'): Promise<string | null> {
    try {
      const programId = this.programIds[pool];
      const url = `${this.apiUrl}/${this.network}/program/${programId}/mapping/${mapping}/${key}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw = await res.json();
      // Strip surrounding quotes returned by API: "\"1u8\"" → "1u8"
      if (typeof raw === 'string') return raw.replace(/^"|"$/g, '');
      return String(raw);
    } catch {
      return null;
    }
  }

  private parseU8(raw: string | null): number {
    if (!raw) return 0;
    return parseInt(raw.replace(/u\d+$/, '')) || 0;
  }

  private parseU32(raw: string | null): number {
    if (!raw) return 0;
    return parseInt(raw.replace(/u\d+$/, '')) || 0;
  }

  private parseU64(raw: string | null): number {
    if (!raw) return 0;
    return parseInt(raw.replace(/u\d+$/, '')) || 0;
  }

  // ── Credit Passport ──────────────────────────────────────────

  /**
   * Fetch the Credit Passport for any Aleo address.
   * Returns the published tier, or null if no passport has been published.
   *
   * @example
   * const client = new ZeroLendClient();
   * const passport = await client.getPassport('aleo1...');
   * if (passport.published) {
   *   console.log(`Tier: ${passport.tier}`); // e.g. 3 (Gold)
   * }
   */
  async getPassport(address: string): Promise<CreditPassport> {
    const [tierRaw, blockRaw] = await Promise.all([
      this.fetchMapping('credit_passport',     address),
      this.fetchMapping('passport_updated_at', address),
    ]);

    const tier      = this.parseU8(tierRaw);
    const updatedAt = this.parseU32(blockRaw);

    if (tier === 0) {
      return { address, tier: null, updatedAt: 0, published: false };
    }

    return {
      address,
      tier:      tier as CreditTier,
      updatedAt,
      published: true,
    };
  }

  /**
   * Check whether an address meets a minimum tier requirement.
   * Use this to gate access to your protocol features.
   *
   * @example
   * const result = await client.requireTier('aleo1...', 3);
   * if (!result.passes) {
   *   throw new Error(result.reason);
   *   // "Address has no published passport"
   *   // "Tier 2 (Silver) does not meet minimum Tier 3 (Gold)"
   * }
   */
  async requireTier(address: string, minTier: CreditTier): Promise<TierCheckResult> {
    const passport = await this.getPassport(address);

    if (!passport.published || passport.tier === null) {
      return {
        passes:       false,
        actualTier:   null,
        requiredTier: minTier,
        reason:       'Address has no published Credit Passport',
      };
    }

    const passes = passport.tier >= minTier;
    const actualLabel   = TIER_INFO[passport.tier].label;
    const requiredLabel = TIER_INFO[minTier].label;

    return {
      passes,
      actualTier:   passport.tier,
      requiredTier: minTier,
      reason: passes
        ? `Tier ${passport.tier} (${actualLabel}) meets minimum Tier ${minTier} (${requiredLabel})`
        : `Tier ${passport.tier} (${actualLabel}) does not meet minimum Tier ${minTier} (${requiredLabel})`,
    };
  }

  /**
   * Fetch passports for multiple addresses in parallel.
   * Useful for batch verification (e.g. DAO voting, airdrop eligibility).
   *
   * @example
   * const passports = await client.getPassports(['aleo1...', 'aleo1...']);
   */
  async getPassports(addresses: string[]): Promise<CreditPassport[]> {
    return Promise.all(addresses.map(a => this.getPassport(a)));
  }

  /**
   * Filter a list of addresses to only those meeting a minimum tier.
   *
   * @example
   * const eligible = await client.filterByTier(addresses, 3);
   * // Only Gold+ addresses
   */
  async filterByTier(addresses: string[], minTier: CreditTier): Promise<string[]> {
    const passports = await this.getPassports(addresses);
    return passports
      .filter(p => p.published && p.tier !== null && p.tier >= minTier)
      .map(p => p.address);
  }

  // ── Pool Stats ───────────────────────────────────────────────

  /**
   * Fetch current pool statistics from chain.
   *
   * @param pool - Which pool to query: 'aleo' (default), 'usdcx', or 'usad'
   *
   * @example
   * const aleoStats  = await client.getPoolStats('aleo');
   * const usdcxStats = await client.getPoolStats('usdcx');
   * console.log(`ALEO utilization: ${aleoStats.utilizationRate}%`);
   */
  async getPoolStats(pool: TokenPool = 'aleo'): Promise<PoolStats> {
    const [liqRaw, borRaw, earnRaw, lcRaw] = await Promise.all([
      this.fetchMapping('pool_liquidity',       '0u8', pool),
      this.fetchMapping('pool_borrowed',        '0u8', pool),
      this.fetchMapping('pool_interest_earned', '0u8', pool),
      this.fetchMapping('active_loan_count',    '0u8', pool),
    ]);

    const totalLiquidity  = this.parseU64(liqRaw);
    const totalBorrowed   = this.parseU64(borRaw);
    const interestEarned  = this.parseU64(earnRaw);
    const activeLoanCount = this.parseU32(lcRaw);
    const utilizationRate = totalLiquidity > 0
      ? Math.round((totalBorrowed / totalLiquidity) * 100)
      : 0;

    return { totalLiquidity, totalBorrowed, interestEarned, activeLoanCount, utilizationRate };
  }

  /**
   * Fetch flash loan statistics from chain.
   *
   * @param pool - Which pool to query: 'aleo' (default), 'usdcx', or 'usad'
   */
  async getFlashLoanStats(pool: TokenPool = 'aleo'): Promise<FlashLoanStats> {
    const [feesRaw, countRaw] = await Promise.all([
      this.fetchMapping('flash_loan_fees',  '0u8', pool),
      this.fetchMapping('flash_loan_count', '0u8', pool),
    ]);

    return {
      totalFeesEarned: this.parseU64(feesRaw),
      totalLoansCount: this.parseU32(countRaw),
    };
  }

  /**
   * Fetch stats for all three pools in parallel.
   *
   * @example
   * const { aleo, usdcx, usad } = await client.getAllPoolStats();
   */
  async getAllPoolStats(): Promise<Record<TokenPool, PoolStats>> {
    const [aleo, usdcx, usad] = await Promise.all([
      this.getPoolStats('aleo'),
      this.getPoolStats('usdcx'),
      this.getPoolStats('usad'),
    ]);
    return { aleo, usdcx, usad };
  }

  /**
   * Fetch flash loan stats for all three pools in parallel.
   */
  async getAllFlashLoanStats(): Promise<Record<TokenPool, FlashLoanStats>> {
    const [aleo, usdcx, usad] = await Promise.all([
      this.getFlashLoanStats('aleo'),
      this.getFlashLoanStats('usdcx'),
      this.getFlashLoanStats('usad'),
    ]);
    return { aleo, usdcx, usad };
  }

  /**
   * Fetch tier distribution across all attested wallets.
   * Returns a map of tier → count of wallets in that tier.
   * Note: tier distribution is tracked on the ALEO (main) contract only.
   */
  async getTierDistribution(): Promise<Record<CreditTier, number>> {
    const tiers = [1, 2, 3, 4, 5] as CreditTier[];
    const counts = await Promise.all(
      tiers.map(t => this.fetchMapping('aggregate_tier_count', `${t}u8`, 'aleo'))
    );
    return Object.fromEntries(
      tiers.map((t, i) => [t, this.parseU32(counts[i])])
    ) as Record<CreditTier, number>;
  }

  // ── Oracle ───────────────────────────────────────────────────

  /**
   * Get the status of all three oracle slots.
   * Returns registered address and slash count per slot.
   */
  async getOracleSlots(): Promise<OracleSlot[]> {
    const slots = [0, 1, 2];
    const results = await Promise.all(slots.map(async (slot) => {
      const [addrRaw, slashRaw] = await Promise.all([
        this.fetchMappingFromProgram(PROGRAM_ID_ORACLE, 'oracle_registry',  `${slot}u8`),
        this.fetchMappingFromProgram(PROGRAM_ID_ORACLE, 'slash_count',      `${slot}u8`),
      ]);
      return {
        slot,
        address:    addrRaw ?? null,
        slashCount: this.parseU32(slashRaw),
      } as OracleSlot;
    }));
    return results;
  }

  /**
   * Check whether an oracle consensus has been reached for a wallet.
   * Returns true if finalized_hash is non-zero for that address.
   */
  async isOracleVerified(address: string): Promise<boolean> {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_ORACLE, 'finalized_hash', address
    );
    return raw !== null && raw !== '0field';
  }

  // ── Vouching ─────────────────────────────────────────────────

  /**
   * Get the active tier boost for a borrower from the vouching contract.
   * Returns 0 if no active vouch.
   */
  async getVouchBoost(borrower: string): Promise<number> {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_VOUCHING, 'vouch_boost', borrower
    );
    return this.parseU8(raw);
  }

  /**
   * Get the effective (boosted) tier for an address.
   * Combines passport tier + any active vouch boost.
   */
  async getEffectiveTier(address: string): Promise<CreditTier | null> {
    const [passport, boost] = await Promise.all([
      this.getPassport(address),
      this.getVouchBoost(address),
    ]);
    if (!passport.published || passport.tier === null) return null;
    const effective = Math.min(passport.tier + boost, 5) as CreditTier;
    return effective;
  }

  /**
   * Get the number of active outbound vouches for a voucher address.
   */
  async getVouchesOut(voucher: string): Promise<number> {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_VOUCHING, 'vouches_out', voucher
    );
    return this.parseU32(raw);
  }

  /**
   * Get the total ALEO staked by a voucher across all active vouches.
   */
  async getTotalStaked(voucher: string): Promise<number> {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_VOUCHING, 'total_staked', voucher
    );
    return this.parseU64(raw);
  }

  // ── Governance ────────────────────────────────────────────────

  /**
   * Get the total number of proposals submitted.
   */
  async getProposalCount(): Promise<number> {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_GOVERNANCE, 'proposal_count', '0u8'
    );
    return this.parseU32(raw);
  }

  /**
   * Get the total governance stake across all participants.
   */
  async getGovernanceTotalStaked(): Promise<number> {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_GOVERNANCE, 'total_staked', '0u8'
    );
    return this.parseU64(raw);
  }

  /**
   * Get the governance stake for a specific address.
   */
  async getGovernanceStake(address: string): Promise<number> {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_GOVERNANCE, 'staked_balance', address
    );
    return this.parseU64(raw);
  }
}

// ================================================================
// Standalone utility functions (no client needed)
// ================================================================

/**
 * Get human-readable info for a tier level.
 *
 * @example
 * const info = getTierInfo(3);
 * // { tier: 3, label: 'Gold', maxLoanAleo: 200, rateApr: 10, ... }
 */
export function getTierInfo(tier: CreditTier): TierInfo {
  return TIER_INFO[tier];
}

/**
 * Convert microcredits to ALEO.
 * @example microToAleo(5_000_000) // → 5
 */
export function microToAleo(microcredits: number): number {
  return microcredits / MICROCREDITS_PER_ALEO;
}

/**
 * Convert ALEO to microcredits.
 * @example aleoToMicro(5) // → 5_000_000
 */
export function aleoToMicro(aleo: number): number {
  return Math.floor(aleo * MICROCREDITS_PER_ALEO);
}

/**
 * Validate an Aleo address format.
 * @example isValidAleoAddress('aleo1abc...') // → true
 */
export function isValidAleoAddress(address: string): boolean {
  return /^aleo1[a-z0-9]{58}$/.test(address);
}

/**
 * Get the max loan amount in ALEO for a given tier.
 * @example maxLoanForTier(3) // → 200
 */
export function maxLoanForTier(tier: CreditTier): number {
  return TIER_INFO[tier].maxLoanAleo;
}

/**
 * Get the annual interest rate (%) for a given tier.
 * @example aprForTier(5) // → 4
 */
export function aprForTier(tier: CreditTier): number {
  return TIER_INFO[tier].rateApr;
}

/**
 * Compute interest owed given principal, rate, and blocks elapsed.
 * Matches the on-chain formula exactly.
 *
 * @param principal  - Loan amount in microcredits
 * @param rateBps    - Interest rate in basis points per 1000 blocks
 * @param blocksHeld - Number of blocks since loan was taken
 */
export function computeInterest(principal: number, rateBps: number, blocksHeld: number): number {
  return Math.floor((principal * rateBps * blocksHeld) / 10_000_000);
}

/**
 * Compute flash loan fee for a given amount.
 * @param amount - Loan amount in base units
 * @param pool   - 'aleo' = 1% fee, 'usdcx' = 0.3% fee, 'usad' = 0.5% fee
 * @returns fee in base units (minimum 1)
 */
export function flashLoanFee(amount: number, pool: TokenPool = 'aleo'): number {
  const bps = pool === 'aleo' ? 100 : pool === 'usdcx' ? 30 : 50;
  const fee = Math.floor((amount * bps) / 10_000);
  return Math.max(fee, 1);
}

/**
 * Get the max loan amount for a given tier and pool.
 *
 * @param tier - Credit tier (1-5)
 * @param pool - 'aleo' returns ALEO amount, 'usdcx'/'usad' return USD amount
 *
 * @example
 * maxLoanForPool(3, 'usdcx') // → 200  ($200 in USDCx)
 * maxLoanForPool(3, 'aleo')  // → 200  (200 ALEO)
 */
export function maxLoanForPool(tier: CreditTier, pool: TokenPool): number {
  const info = TIER_INFO[tier];
  if (pool === 'usdcx') return info.maxLoanUsdcx;
  if (pool === 'usad')  return info.maxLoanUsad;
  return info.maxLoanAleo;
}

/**
 * Get the annual interest rate (%) for a given tier and pool.
 *
 * @example
 * aprForPool(5, 'usdcx') // → 3  (3% for Diamond tier in USDCx pool)
 */
export function aprForPool(tier: CreditTier, pool: TokenPool): number {
  const info = TIER_INFO[tier];
  if (pool === 'usdcx') return info.rateAprUsdcx;
  if (pool === 'usad')  return info.rateAprUsad;
  return info.rateApr;
}

/**
 * Convert a stablecoin amount (whole units) to base units (6 decimals).
 * @example usdToBase(10) // → 10_000_000
 */
export function usdToBase(amount: number): number {
  return Math.floor(amount * 1_000_000);
}

/**
 * Convert stablecoin base units to whole USD value.
 * @example baseToUsd(10_000_000) // → 10
 */
export function baseToUsd(base: number): number {
  return base / 1_000_000;
}