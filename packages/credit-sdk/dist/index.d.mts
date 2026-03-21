/** Credit tier levels (1 = Bronze … 5 = Diamond) */
type CreditTier = 1 | 2 | 3 | 4 | 5;
/** Human-readable tier metadata */
interface TierInfo {
    tier: CreditTier;
    label: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
    minScore: number;
    maxLoanAleo: number;
    rateApr: number;
    color: string;
}
/** A published Credit Passport entry read from chain */
interface CreditPassport {
    /** Aleo wallet address */
    address: string;
    /** Published tier (1-5). Null if no passport published. */
    tier: CreditTier | null;
    /** Block height when passport was last updated */
    updatedAt: number;
    /** Whether a passport is currently published */
    published: boolean;
}
/** Result of a tier requirement check */
interface TierCheckResult {
    /** Whether the address meets the requirement */
    passes: boolean;
    /** The address's actual tier (null if no passport) */
    actualTier: CreditTier | null;
    /** The required minimum tier */
    requiredTier: CreditTier;
    /** Human-readable reason */
    reason: string;
}
/** Options for ZeroLendClient */
interface ZeroLendClientOptions {
    /**
     * Aleo API base URL.
     * @default "https://api.explorer.provable.com/v1"
     */
    apiUrl?: string;
    /**
     * Aleo network (testnet | mainnet).
     * @default "testnet"
     */
    network?: 'testnet' | 'mainnet';
    /**
     * Custom ZeroLend program ID (if using a fork or local deployment).
     * @default "zerolend_lending_pool_v3.aleo"
     */
    programId?: string;
}
/** Flash loan statistics from chain */
interface FlashLoanStats {
    totalFeesEarned: number;
    totalLoansCount: number;
}
/** Pool statistics from chain */
interface PoolStats {
    totalLiquidity: number;
    totalBorrowed: number;
    interestEarned: number;
    activeLoanCount: number;
    utilizationRate: number;
}
declare const PROGRAM_ID = "zerolend_lending_pool_v3.aleo";
declare const DEFAULT_API_URL = "https://api.explorer.provable.com/v1";
declare const TIER_INFO: Record<CreditTier, TierInfo>;
declare const MICROCREDITS_PER_ALEO = 1000000;
declare class ZeroLendClient {
    private apiUrl;
    private network;
    private programId;
    constructor(options?: ZeroLendClientOptions);
    private fetchMapping;
    private parseU8;
    private parseU32;
    private parseU64;
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
    getPassport(address: string): Promise<CreditPassport>;
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
    requireTier(address: string, minTier: CreditTier): Promise<TierCheckResult>;
    /**
     * Fetch passports for multiple addresses in parallel.
     * Useful for batch verification (e.g. DAO voting, airdrop eligibility).
     *
     * @example
     * const passports = await client.getPassports(['aleo1...', 'aleo1...']);
     */
    getPassports(addresses: string[]): Promise<CreditPassport[]>;
    /**
     * Filter a list of addresses to only those meeting a minimum tier.
     *
     * @example
     * const eligible = await client.filterByTier(addresses, 3);
     * // Only Gold+ addresses
     */
    filterByTier(addresses: string[], minTier: CreditTier): Promise<string[]>;
    /**
     * Fetch current pool statistics from chain.
     *
     * @example
     * const stats = await client.getPoolStats();
     * console.log(`Utilization: ${stats.utilizationRate}%`);
     */
    getPoolStats(): Promise<PoolStats>;
    /**
     * Fetch flash loan statistics from chain.
     */
    getFlashLoanStats(): Promise<FlashLoanStats>;
    /**
     * Fetch tier distribution across all attested wallets.
     * Returns a map of tier → count of wallets in that tier.
     */
    getTierDistribution(): Promise<Record<CreditTier, number>>;
}
/**
 * Get human-readable info for a tier level.
 *
 * @example
 * const info = getTierInfo(3);
 * // { tier: 3, label: 'Gold', maxLoanAleo: 200, rateApr: 10, ... }
 */
declare function getTierInfo(tier: CreditTier): TierInfo;
/**
 * Convert microcredits to ALEO.
 * @example microToAleo(5_000_000) // → 5
 */
declare function microToAleo(microcredits: number): number;
/**
 * Convert ALEO to microcredits.
 * @example aleoToMicro(5) // → 5_000_000
 */
declare function aleoToMicro(aleo: number): number;
/**
 * Validate an Aleo address format.
 * @example isValidAleoAddress('aleo1abc...') // → true
 */
declare function isValidAleoAddress(address: string): boolean;
/**
 * Get the max loan amount in ALEO for a given tier.
 * @example maxLoanForTier(3) // → 200
 */
declare function maxLoanForTier(tier: CreditTier): number;
/**
 * Get the annual interest rate (%) for a given tier.
 * @example aprForTier(5) // → 4
 */
declare function aprForTier(tier: CreditTier): number;
/**
 * Compute interest owed given principal, rate, and blocks elapsed.
 * Matches the on-chain formula exactly.
 *
 * @param principal  - Loan amount in microcredits
 * @param rateBps    - Interest rate in basis points per 1000 blocks
 * @param blocksHeld - Number of blocks since loan was taken
 */
declare function computeInterest(principal: number, rateBps: number, blocksHeld: number): number;
/**
 * Compute flash loan fee for a given amount.
 * @param amount - Loan amount in microcredits
 * @returns fee in microcredits (1% of amount, minimum 1)
 */
declare function flashLoanFee(amount: number): number;

export { type CreditPassport, type CreditTier, DEFAULT_API_URL, type FlashLoanStats, MICROCREDITS_PER_ALEO, PROGRAM_ID, type PoolStats, TIER_INFO, type TierCheckResult, type TierInfo, ZeroLendClient, type ZeroLendClientOptions, aleoToMicro, aprForTier, computeInterest, flashLoanFee, getTierInfo, isValidAleoAddress, maxLoanForTier, microToAleo };
