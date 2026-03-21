'use strict';

// src/index.ts
var PROGRAM_ID = "zerolend_lending_pool_v3.aleo";
var DEFAULT_API_URL = "https://api.explorer.provable.com/v1";
var TIER_INFO = {
  1: { tier: 1, label: "Bronze", minScore: 0, maxLoanAleo: 10, rateApr: 20, color: "#ef4444" },
  2: { tier: 2, label: "Silver", minScore: 300, maxLoanAleo: 50, rateApr: 15, color: "#f59e0b" },
  3: { tier: 3, label: "Gold", minScore: 500, maxLoanAleo: 200, rateApr: 10, color: "#3b82f6" },
  4: { tier: 4, label: "Platinum", minScore: 700, maxLoanAleo: 1e3, rateApr: 7, color: "#10b981" },
  5: { tier: 5, label: "Diamond", minScore: 850, maxLoanAleo: 5e3, rateApr: 4, color: "#00d4ff" }
};
var MICROCREDITS_PER_ALEO = 1e6;
var ZeroLendClient = class {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl ?? DEFAULT_API_URL;
    this.network = options.network ?? "testnet";
    this.programId = options.programId ?? PROGRAM_ID;
  }
  // ── Internal helpers ─────────────────────────────────────────
  async fetchMapping(mapping, key) {
    try {
      const url = `${this.apiUrl}/${this.network}/program/${this.programId}/mapping/${mapping}/${key}`;
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
   * @example
   * const stats = await client.getPoolStats();
   * console.log(`Utilization: ${stats.utilizationRate}%`);
   */
  async getPoolStats() {
    const [liqRaw, borRaw, earnRaw, lcRaw] = await Promise.all([
      this.fetchMapping("pool_liquidity", "0u8"),
      this.fetchMapping("pool_borrowed", "0u8"),
      this.fetchMapping("pool_interest_earned", "0u8"),
      this.fetchMapping("active_loan_count", "0u8")
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
   */
  async getFlashLoanStats() {
    const [feesRaw, countRaw] = await Promise.all([
      this.fetchMapping("flash_loan_fees", "0u8"),
      this.fetchMapping("flash_loan_count", "0u8")
    ]);
    return {
      totalFeesEarned: this.parseU64(feesRaw),
      totalLoansCount: this.parseU32(countRaw)
    };
  }
  /**
   * Fetch tier distribution across all attested wallets.
   * Returns a map of tier → count of wallets in that tier.
   */
  async getTierDistribution() {
    const tiers = [1, 2, 3, 4, 5];
    const counts = await Promise.all(
      tiers.map((t) => this.fetchMapping("aggregate_tier_count", `${t}u8`))
    );
    return Object.fromEntries(
      tiers.map((t, i) => [t, this.parseU32(counts[i])])
    );
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
function flashLoanFee(amount) {
  const fee = Math.floor(amount * 100 / 1e4);
  return Math.max(fee, 1);
}

exports.DEFAULT_API_URL = DEFAULT_API_URL;
exports.MICROCREDITS_PER_ALEO = MICROCREDITS_PER_ALEO;
exports.PROGRAM_ID = PROGRAM_ID;
exports.TIER_INFO = TIER_INFO;
exports.ZeroLendClient = ZeroLendClient;
exports.aleoToMicro = aleoToMicro;
exports.aprForTier = aprForTier;
exports.computeInterest = computeInterest;
exports.flashLoanFee = flashLoanFee;
exports.getTierInfo = getTierInfo;
exports.isValidAleoAddress = isValidAleoAddress;
exports.maxLoanForTier = maxLoanForTier;
exports.microToAleo = microToAleo;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map