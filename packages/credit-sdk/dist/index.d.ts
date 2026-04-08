/** Credit tier levels (1 = Bronze … 5 = Diamond) */
type CreditTier = 1 | 2 | 3 | 4 | 5;
/** Supported lending pools */
type TokenPool = 'aleo' | 'usdcx' | 'usad';
/** Human-readable tier metadata */
interface TierInfo {
    tier: CreditTier;
    label: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
    minScore: number;
    maxLoanAleo: number;
    maxLoanUsdcx: number;
    maxLoanUsad: number;
    rateApr: number;
    rateAprUsdcx: number;
    rateAprUsad: number;
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
     * @default "https://api.explorer.provable.com/v2"
     */
    apiUrl?: string;
    /**
     * Aleo network (testnet | mainnet).
     * @default "testnet"
     */
    network?: 'testnet' | 'mainnet';
    /**
     * Override program IDs for any pool.
     * Defaults to the canonical deployed program IDs.
     */
    programIds?: {
        aleo?: string;
        usdcx?: string;
        usad?: string;
    };
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
/** Oracle status for a single slot */
interface OracleSlot {
    slot: number;
    address: string | null;
    slashCount: number;
}
/** Active vouch details */
interface VouchInfo {
    voucher: string;
    borrower: string;
    staked: number;
    issuedBlock: number;
    boostedTier: number;
}
/** Governance proposal summary */
interface ProposalSummary {
    id: string;
    proposer: string;
    startBlock: number;
    endBlock: number;
    yesWeight: number;
    noWeight: number;
    executed: boolean;
}
declare const PROGRAM_ID = "zerolend_lending_pool_v4.aleo";
declare const PROGRAM_ID_USDCX = "zerolend_usdcx_v1.aleo";
declare const PROGRAM_ID_USAD = "zerolend_usad_v1.aleo";
declare const USDCX_TOKEN_PROGRAM = "test_usdcx_stablecoin.aleo";
declare const USAD_TOKEN_PROGRAM = "test_usad_stablecoin.aleo";
declare const PROGRAM_ID_ORACLE = "zerolend_oracle_v1.aleo";
declare const PROGRAM_ID_VOUCHING = "zerolend_vouching_v1.aleo";
declare const PROGRAM_ID_GOVERNANCE = "zerolend_governance_v1.aleo";
declare const DEFAULT_API_URL = "https://api.explorer.provable.com/v2";
declare const TIER_INFO: Record<CreditTier, TierInfo>;
declare const MICROCREDITS_PER_ALEO = 1000000;
declare class ZeroLendClient {
    private apiUrl;
    private network;
    private programIds;
    constructor(options?: ZeroLendClientOptions);
    private fetchMappingFromProgram;
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
     * @param pool - Which pool to query: 'aleo' (default), 'usdcx', or 'usad'
     *
     * @example
     * const aleoStats  = await client.getPoolStats('aleo');
     * const usdcxStats = await client.getPoolStats('usdcx');
     * console.log(`ALEO utilization: ${aleoStats.utilizationRate}%`);
     */
    getPoolStats(pool?: TokenPool): Promise<PoolStats>;
    /**
     * Fetch flash loan statistics from chain.
     *
     * @param pool - Which pool to query: 'aleo' (default), 'usdcx', or 'usad'
     */
    getFlashLoanStats(pool?: TokenPool): Promise<FlashLoanStats>;
    /**
     * Fetch stats for all three pools in parallel.
     *
     * @example
     * const { aleo, usdcx, usad } = await client.getAllPoolStats();
     */
    getAllPoolStats(): Promise<Record<TokenPool, PoolStats>>;
    /**
     * Fetch flash loan stats for all three pools in parallel.
     */
    getAllFlashLoanStats(): Promise<Record<TokenPool, FlashLoanStats>>;
    /**
     * Fetch tier distribution across all attested wallets.
     * Returns a map of tier → count of wallets in that tier.
     * Note: tier distribution is tracked on the ALEO (main) contract only.
     */
    getTierDistribution(): Promise<Record<CreditTier, number>>;
    /**
     * Get the status of all three oracle slots.
     * Returns registered address and slash count per slot.
     */
    getOracleSlots(): Promise<OracleSlot[]>;
    /**
     * Check whether an oracle consensus has been reached for a wallet.
     * Returns true if finalized_hash is non-zero for that address.
     */
    isOracleVerified(address: string): Promise<boolean>;
    /**
     * Get the active tier boost for a borrower from the vouching contract.
     * Returns 0 if no active vouch.
     */
    getVouchBoost(borrower: string): Promise<number>;
    /**
     * Get the effective (boosted) tier for an address.
     * Combines passport tier + any active vouch boost.
     */
    getEffectiveTier(address: string): Promise<CreditTier | null>;
    /**
     * Get the number of active outbound vouches for a voucher address.
     */
    getVouchesOut(voucher: string): Promise<number>;
    /**
     * Get the total ALEO staked by a voucher across all active vouches.
     */
    getTotalStaked(voucher: string): Promise<number>;
    /**
     * Get the total number of proposals submitted.
     */
    getProposalCount(): Promise<number>;
    /**
     * Get the total governance stake across all participants.
     */
    getGovernanceTotalStaked(): Promise<number>;
    /**
     * Get the governance stake for a specific address.
     */
    getGovernanceStake(address: string): Promise<number>;
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
 * @param amount - Loan amount in base units
 * @param pool   - 'aleo' = 1% fee, 'usdcx' = 0.3% fee, 'usad' = 0.5% fee
 * @returns fee in base units (minimum 1)
 */
declare function flashLoanFee(amount: number, pool?: TokenPool): number;
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
declare function maxLoanForPool(tier: CreditTier, pool: TokenPool): number;
/**
 * Get the annual interest rate (%) for a given tier and pool.
 *
 * @example
 * aprForPool(5, 'usdcx') // → 3  (3% for Diamond tier in USDCx pool)
 */
declare function aprForPool(tier: CreditTier, pool: TokenPool): number;
/**
 * Convert a stablecoin amount (whole units) to base units (6 decimals).
 * @example usdToBase(10) // → 10_000_000
 */
declare function usdToBase(amount: number): number;
/**
 * Convert stablecoin base units to whole USD value.
 * @example baseToUsd(10_000_000) // → 10
 */
declare function baseToUsd(base: number): number;

export { type CreditPassport, type CreditTier, DEFAULT_API_URL, type FlashLoanStats, MICROCREDITS_PER_ALEO, type OracleSlot, PROGRAM_ID, PROGRAM_ID_GOVERNANCE, PROGRAM_ID_ORACLE, PROGRAM_ID_USAD, PROGRAM_ID_USDCX, PROGRAM_ID_VOUCHING, type PoolStats, type ProposalSummary, TIER_INFO, type TierCheckResult, type TierInfo, type TokenPool, USAD_TOKEN_PROGRAM, USDCX_TOKEN_PROGRAM, type VouchInfo, ZeroLendClient, type ZeroLendClientOptions, aleoToMicro, aprForPool, aprForTier, baseToUsd, computeInterest, flashLoanFee, getTierInfo, isValidAleoAddress, maxLoanForPool, maxLoanForTier, microToAleo, usdToBase };
