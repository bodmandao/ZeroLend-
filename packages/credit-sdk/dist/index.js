'use strict';

// src/index.ts
var PROGRAM_ID = "zerolend_lending_pool_v4.aleo";
var PROGRAM_ID_USDCX = "zerolend_usdcx_v1.aleo";
var PROGRAM_ID_USAD = "zerolend_usad_v1.aleo";
var USDCX_TOKEN_PROGRAM = "test_usdcx_stablecoin.aleo";
var USAD_TOKEN_PROGRAM = "test_usad_stablecoin.aleo";
var PROGRAM_ID_ORACLE = "zerolend_oracle_v1.aleo";
var PROGRAM_ID_VOUCHING = "zerolend_vouching_v1.aleo";
var PROGRAM_ID_GOVERNANCE = "zerolend_governance_v1.aleo";
var DEFAULT_API_URL = "https://api.explorer.provable.com/v2";
var TIER_INFO = {
  1: { tier: 1, label: "Bronze", minScore: 0, maxLoanAleo: 10, maxLoanUsdcx: 10, maxLoanUsad: 10, rateApr: 20, rateAprUsdcx: 15, rateAprUsad: 18, color: "#ef4444" },
  2: { tier: 2, label: "Silver", minScore: 300, maxLoanAleo: 50, maxLoanUsdcx: 50, maxLoanUsad: 50, rateApr: 15, rateAprUsdcx: 11, rateAprUsad: 13, color: "#f59e0b" },
  3: { tier: 3, label: "Gold", minScore: 500, maxLoanAleo: 200, maxLoanUsdcx: 200, maxLoanUsad: 200, rateApr: 10, rateAprUsdcx: 8, rateAprUsad: 10, color: "#3b82f6" },
  4: { tier: 4, label: "Platinum", minScore: 700, maxLoanAleo: 1e3, maxLoanUsdcx: 1e3, maxLoanUsad: 1e3, rateApr: 7, rateAprUsdcx: 5, rateAprUsad: 6, color: "#10b981" },
  5: { tier: 5, label: "Diamond", minScore: 850, maxLoanAleo: 5e3, maxLoanUsdcx: 5e3, maxLoanUsad: 5e3, rateApr: 4, rateAprUsdcx: 3, rateAprUsad: 4, color: "#00d4ff" }
};
var MICROCREDITS_PER_ALEO = 1e6;
var ZeroLendClient = class {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl ?? DEFAULT_API_URL;
    this.network = options.network ?? "testnet";
    this.programIds = {
      aleo: options.programIds?.aleo ?? PROGRAM_ID,
      usdcx: options.programIds?.usdcx ?? PROGRAM_ID_USDCX,
      usad: options.programIds?.usad ?? PROGRAM_ID_USAD
    };
  }
  // ── Internal helpers ─────────────────────────────────────────
  async fetchMappingFromProgram(programId, mapping, key) {
    try {
      const url = `${this.apiUrl}/${this.network}/program/${programId}/mapping/${mapping}/${key}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw = await res.json();
      if (typeof raw === "string") return raw.replace(/^"|"$/g, "");
      return String(raw);
    } catch {
      return null;
    }
  }
  async fetchMapping(mapping, key, pool = "aleo") {
    try {
      const programId = this.programIds[pool];
      const url = `${this.apiUrl}/${this.network}/program/${programId}/mapping/${mapping}/${key}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw = await res.json();
      if (typeof raw === "string") return raw.replace(/^"|"$/g, "");
      return String(raw);
    } catch {
      return null;
    }
  }
  parseU8(raw) {
    if (!raw) return 0;
    return parseInt(raw.replace(/u\d+$/, "")) || 0;
  }
  parseU32(raw) {
    if (!raw) return 0;
    return parseInt(raw.replace(/u\d+$/, "")) || 0;
  }
  parseU64(raw) {
    if (!raw) return 0;
    return parseInt(raw.replace(/u\d+$/, "")) || 0;
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
  async getPassport(address) {
    const [tierRaw, blockRaw] = await Promise.all([
      this.fetchMapping("credit_passport", address),
      this.fetchMapping("passport_updated_at", address)
    ]);
    const tier = this.parseU8(tierRaw);
    const updatedAt = this.parseU32(blockRaw);
    if (tier === 0) {
      return { address, tier: null, updatedAt: 0, published: false };
    }
    return {
      address,
      tier,
      updatedAt,
      published: true
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
  async requireTier(address, minTier) {
    const passport = await this.getPassport(address);
    if (!passport.published || passport.tier === null) {
      return {
        passes: false,
        actualTier: null,
        requiredTier: minTier,
        reason: "Address has no published Credit Passport"
      };
    }
    const passes = passport.tier >= minTier;
    const actualLabel = TIER_INFO[passport.tier].label;
    const requiredLabel = TIER_INFO[minTier].label;
    return {
      passes,
      actualTier: passport.tier,
      requiredTier: minTier,
      reason: passes ? `Tier ${passport.tier} (${actualLabel}) meets minimum Tier ${minTier} (${requiredLabel})` : `Tier ${passport.tier} (${actualLabel}) does not meet minimum Tier ${minTier} (${requiredLabel})`
    };
  }
  /**
   * Fetch passports for multiple addresses in parallel.
   * Useful for batch verification (e.g. DAO voting, airdrop eligibility).
   *
   * @example
   * const passports = await client.getPassports(['aleo1...', 'aleo1...']);
   */
  async getPassports(addresses) {
    return Promise.all(addresses.map((a) => this.getPassport(a)));
  }
  /**
   * Filter a list of addresses to only those meeting a minimum tier.
   *
   * @example
   * const eligible = await client.filterByTier(addresses, 3);
   * // Only Gold+ addresses
   */
  async filterByTier(addresses, minTier) {
    const passports = await this.getPassports(addresses);
    return passports.filter((p) => p.published && p.tier !== null && p.tier >= minTier).map((p) => p.address);
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
  async getPoolStats(pool = "aleo") {
    const [liqRaw, borRaw, earnRaw, lcRaw] = await Promise.all([
      this.fetchMapping("pool_liquidity", "0u8", pool),
      this.fetchMapping("pool_borrowed", "0u8", pool),
      this.fetchMapping("pool_interest_earned", "0u8", pool),
      this.fetchMapping("active_loan_count", "0u8", pool)
    ]);
    const totalLiquidity = this.parseU64(liqRaw);
    const totalBorrowed = this.parseU64(borRaw);
    const interestEarned = this.parseU64(earnRaw);
    const activeLoanCount = this.parseU32(lcRaw);
    const utilizationRate = totalLiquidity > 0 ? Math.round(totalBorrowed / totalLiquidity * 100) : 0;
    return { totalLiquidity, totalBorrowed, interestEarned, activeLoanCount, utilizationRate };
  }
  /**
   * Fetch flash loan statistics from chain.
   *
   * @param pool - Which pool to query: 'aleo' (default), 'usdcx', or 'usad'
   */
  async getFlashLoanStats(pool = "aleo") {
    const [feesRaw, countRaw] = await Promise.all([
      this.fetchMapping("flash_loan_fees", "0u8", pool),
      this.fetchMapping("flash_loan_count", "0u8", pool)
    ]);
    return {
      totalFeesEarned: this.parseU64(feesRaw),
      totalLoansCount: this.parseU32(countRaw)
    };
  }
  /**
   * Fetch stats for all three pools in parallel.
   *
   * @example
   * const { aleo, usdcx, usad } = await client.getAllPoolStats();
   */
  async getAllPoolStats() {
    const [aleo, usdcx, usad] = await Promise.all([
      this.getPoolStats("aleo"),
      this.getPoolStats("usdcx"),
      this.getPoolStats("usad")
    ]);
    return { aleo, usdcx, usad };
  }
  /**
   * Fetch flash loan stats for all three pools in parallel.
   */
  async getAllFlashLoanStats() {
    const [aleo, usdcx, usad] = await Promise.all([
      this.getFlashLoanStats("aleo"),
      this.getFlashLoanStats("usdcx"),
      this.getFlashLoanStats("usad")
    ]);
    return { aleo, usdcx, usad };
  }
  /**
   * Fetch tier distribution across all attested wallets.
   * Returns a map of tier → count of wallets in that tier.
   * Note: tier distribution is tracked on the ALEO (main) contract only.
   */
  async getTierDistribution() {
    const tiers = [1, 2, 3, 4, 5];
    const counts = await Promise.all(
      tiers.map((t) => this.fetchMapping("aggregate_tier_count", `${t}u8`, "aleo"))
    );
    return Object.fromEntries(
      tiers.map((t, i) => [t, this.parseU32(counts[i])])
    );
  }
  // ── Oracle ───────────────────────────────────────────────────
  /**
   * Get the status of all three oracle slots.
   * Returns registered address and slash count per slot.
   */
  async getOracleSlots() {
    const slots = [0, 1, 2];
    const results = await Promise.all(slots.map(async (slot) => {
      const [addrRaw, slashRaw] = await Promise.all([
        this.fetchMappingFromProgram(PROGRAM_ID_ORACLE, "oracle_registry", `${slot}u8`),
        this.fetchMappingFromProgram(PROGRAM_ID_ORACLE, "slash_count", `${slot}u8`)
      ]);
      return {
        slot,
        address: addrRaw ?? null,
        slashCount: this.parseU32(slashRaw)
      };
    }));
    return results;
  }
  /**
   * Check whether an oracle consensus has been reached for a wallet.
   * Returns true if finalized_hash is non-zero for that address.
   */
  async isOracleVerified(address) {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_ORACLE,
      "finalized_hash",
      address
    );
    return raw !== null && raw !== "0field";
  }
  // ── Vouching ─────────────────────────────────────────────────
  /**
   * Get the active tier boost for a borrower from the vouching contract.
   * Returns 0 if no active vouch.
   */
  async getVouchBoost(borrower) {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_VOUCHING,
      "vouch_boost",
      borrower
    );
    return this.parseU8(raw);
  }
  /**
   * Get the effective (boosted) tier for an address.
   * Combines passport tier + any active vouch boost.
   */
  async getEffectiveTier(address) {
    const [passport, boost] = await Promise.all([
      this.getPassport(address),
      this.getVouchBoost(address)
    ]);
    if (!passport.published || passport.tier === null) return null;
    const effective = Math.min(passport.tier + boost, 5);
    return effective;
  }
  /**
   * Get the number of active outbound vouches for a voucher address.
   */
  async getVouchesOut(voucher) {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_VOUCHING,
      "vouches_out",
      voucher
    );
    return this.parseU32(raw);
  }
  /**
   * Get the total ALEO staked by a voucher across all active vouches.
   */
  async getTotalStaked(voucher) {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_VOUCHING,
      "total_staked",
      voucher
    );
    return this.parseU64(raw);
  }
  // ── Governance ────────────────────────────────────────────────
  /**
   * Get the total number of proposals submitted.
   */
  async getProposalCount() {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_GOVERNANCE,
      "proposal_count",
      "0u8"
    );
    return this.parseU32(raw);
  }
  /**
   * Get the total governance stake across all participants.
   */
  async getGovernanceTotalStaked() {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_GOVERNANCE,
      "total_staked",
      "0u8"
    );
    return this.parseU64(raw);
  }
  /**
   * Get the governance stake for a specific address.
   */
  async getGovernanceStake(address) {
    const raw = await this.fetchMappingFromProgram(
      PROGRAM_ID_GOVERNANCE,
      "staked_balance",
      address
    );
    return this.parseU64(raw);
  }
};
function getTierInfo(tier) {
  return TIER_INFO[tier];
}
function microToAleo(microcredits) {
  return microcredits / MICROCREDITS_PER_ALEO;
}
function aleoToMicro(aleo) {
  return Math.floor(aleo * MICROCREDITS_PER_ALEO);
}
function isValidAleoAddress(address) {
  return /^aleo1[a-z0-9]{58}$/.test(address);
}
function maxLoanForTier(tier) {
  return TIER_INFO[tier].maxLoanAleo;
}
function aprForTier(tier) {
  return TIER_INFO[tier].rateApr;
}
function computeInterest(principal, rateBps, blocksHeld) {
  return Math.floor(principal * rateBps * blocksHeld / 1e7);
}
function flashLoanFee(amount, pool = "aleo") {
  const bps = pool === "aleo" ? 100 : pool === "usdcx" ? 30 : 50;
  const fee = Math.floor(amount * bps / 1e4);
  return Math.max(fee, 1);
}
function maxLoanForPool(tier, pool) {
  const info = TIER_INFO[tier];
  if (pool === "usdcx") return info.maxLoanUsdcx;
  if (pool === "usad") return info.maxLoanUsad;
  return info.maxLoanAleo;
}
function aprForPool(tier, pool) {
  const info = TIER_INFO[tier];
  if (pool === "usdcx") return info.rateAprUsdcx;
  if (pool === "usad") return info.rateAprUsad;
  return info.rateApr;
}
function usdToBase(amount) {
  return Math.floor(amount * 1e6);
}
function baseToUsd(base) {
  return base / 1e6;
}

exports.DEFAULT_API_URL = DEFAULT_API_URL;
exports.MICROCREDITS_PER_ALEO = MICROCREDITS_PER_ALEO;
exports.PROGRAM_ID = PROGRAM_ID;
exports.PROGRAM_ID_GOVERNANCE = PROGRAM_ID_GOVERNANCE;
exports.PROGRAM_ID_ORACLE = PROGRAM_ID_ORACLE;
exports.PROGRAM_ID_USAD = PROGRAM_ID_USAD;
exports.PROGRAM_ID_USDCX = PROGRAM_ID_USDCX;
exports.PROGRAM_ID_VOUCHING = PROGRAM_ID_VOUCHING;
exports.TIER_INFO = TIER_INFO;
exports.USAD_TOKEN_PROGRAM = USAD_TOKEN_PROGRAM;
exports.USDCX_TOKEN_PROGRAM = USDCX_TOKEN_PROGRAM;
exports.ZeroLendClient = ZeroLendClient;
exports.aleoToMicro = aleoToMicro;
exports.aprForPool = aprForPool;
exports.aprForTier = aprForTier;
exports.baseToUsd = baseToUsd;
exports.computeInterest = computeInterest;
exports.flashLoanFee = flashLoanFee;
exports.getTierInfo = getTierInfo;
exports.isValidAleoAddress = isValidAleoAddress;
exports.maxLoanForPool = maxLoanForPool;
exports.maxLoanForTier = maxLoanForTier;
exports.microToAleo = microToAleo;
exports.usdToBase = usdToBase;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map