// ================================================================
// @zerolend/credit-sdk — Core Types
// ================================================================

/** Credit tier levels (1 = Bronze … 5 = Diamond) */
export type CreditTier = 1 | 2 | 3 | 4 | 5;

/** Human-readable tier metadata */
export interface TierInfo {
  tier:        CreditTier;
  label:       'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
  minScore:    number;
  maxLoanAleo: number;   // maximum loan in ALEO
  rateApr:     number;   // annual interest rate %
  color:       string;   // hex color for UI
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
  apiUrl?:     string;
  /**
   * Aleo network (testnet | mainnet).
   * @default "testnet"
   */
  network?:    'testnet' | 'mainnet';
  /**
   * Custom ZeroLend program ID (if using a fork or local deployment).
   * @default "zerolend_lending_pool_v4.aleo"
   */
  programId?:  string;
}

/** Flash loan statistics from chain */
export interface FlashLoanStats {
  totalFeesEarned: number;  // microcredits
  totalLoansCount: number;
}

/** Pool statistics from chain */
export interface PoolStats {
  totalLiquidity:  number;  // microcredits
  totalBorrowed:   number;  // microcredits
  interestEarned:  number;  // microcredits
  activeLoanCount: number;
  utilizationRate: number;  // 0-100
}

// ================================================================
// Constants
// ================================================================

export const PROGRAM_ID = 'zerolend_lending_pool_v4.aleo';

export const DEFAULT_API_URL = 'https://api.explorer.provable.com/v2';

export const TIER_INFO: Record<CreditTier, TierInfo> = {
  1: { tier: 1, label: 'Bronze',   minScore: 0,   maxLoanAleo: 10,    rateApr: 20, color: '#ef4444' },
  2: { tier: 2, label: 'Silver',   minScore: 300, maxLoanAleo: 50,    rateApr: 15, color: '#f59e0b' },
  3: { tier: 3, label: 'Gold',     minScore: 500, maxLoanAleo: 200,   rateApr: 10, color: '#3b82f6' },
  4: { tier: 4, label: 'Platinum', minScore: 700, maxLoanAleo: 1000,  rateApr: 7,  color: '#10b981' },
  5: { tier: 5, label: 'Diamond',  minScore: 850, maxLoanAleo: 5000,  rateApr: 4,  color: '#00d4ff' },
};

export const MICROCREDITS_PER_ALEO = 1_000_000;

// ================================================================
// ZeroLendClient
// ================================================================

export class ZeroLendClient {
  private apiUrl:    string;
  private network:   string;
  private programId: string;

  constructor(options: ZeroLendClientOptions = {}) {
    this.apiUrl    = options.apiUrl    ?? DEFAULT_API_URL;
    this.network   = options.network   ?? 'testnet';
    this.programId = options.programId ?? PROGRAM_ID;
  }

  // ── Internal helpers ─────────────────────────────────────────

  private async fetchMapping(mapping: string, key: string): Promise<string | null> {
    try {
      const url = `${this.apiUrl}/${this.network}/program/${this.programId}/mapping/${mapping}/${key}`;
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
   * @example
   * const stats = await client.getPoolStats();
   * console.log(`Utilization: ${stats.utilizationRate}%`);
   */
  async getPoolStats(): Promise<PoolStats> {
    const [liqRaw, borRaw, earnRaw, lcRaw] = await Promise.all([
      this.fetchMapping('pool_liquidity',       '0u8'),
      this.fetchMapping('pool_borrowed',        '0u8'),
      this.fetchMapping('pool_interest_earned', '0u8'),
      this.fetchMapping('active_loan_count',    '0u8'),
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
   */
  async getFlashLoanStats(): Promise<FlashLoanStats> {
    const [feesRaw, countRaw] = await Promise.all([
      this.fetchMapping('flash_loan_fees',  '0u8'),
      this.fetchMapping('flash_loan_count', '0u8'),
    ]);

    return {
      totalFeesEarned: this.parseU64(feesRaw),
      totalLoansCount: this.parseU32(countRaw),
    };
  }

  /**
   * Fetch tier distribution across all attested wallets.
   * Returns a map of tier → count of wallets in that tier.
   */
  async getTierDistribution(): Promise<Record<CreditTier, number>> {
    const tiers = [1, 2, 3, 4, 5] as CreditTier[];
    const counts = await Promise.all(
      tiers.map(t => this.fetchMapping('aggregate_tier_count', `${t}u8`))
    );
    return Object.fromEntries(
      tiers.map((t, i) => [t, this.parseU32(counts[i])])
    ) as Record<CreditTier, number>;
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
 * @param amount - Loan amount in microcredits
 * @returns fee in microcredits (1% of amount, minimum 1)
 */
export function flashLoanFee(amount: number): number {
  const fee = Math.floor((amount * 100) / 10_000);
  return Math.max(fee, 1);
}