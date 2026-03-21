/**
 * Leo program integration helpers.
 * These are code snippets and utilities for integrating ZeroLend
 * Credit Passports into other Aleo programs.
 */

/** The ZeroLend program ID on Aleo testnet */
export const ZEROLEND_PROGRAM_ID = 'zerolend_lending_pool_v3.aleo';

/**
 * Leo code snippet: require a minimum tier in your Aleo program.
 *
 * Copy this into your Leo program to gate functionality
 * based on a user's published Credit Passport.
 */
export const LEO_REQUIRE_TIER_SNIPPET = `
// Import ZeroLend credit passport check
// Add to your Leo program's finalize block:

// Require Gold tier (3) or higher
async function finalize_my_function(user: address) {
    let tier: u8 = Mapping::get_or_use(
        zerolend_lending_pool_v3.aleo/credit_passport,
        user,
        0u8   // default: no passport = tier 0
    );
    assert(tier >= 3u8);  // 1=Bronze 2=Silver 3=Gold 4=Platinum 5=Diamond
}
`.trim();

/**
 * Generate a Leo code snippet for a custom minimum tier.
 *
 * @example
 * const snippet = generateLeoTierCheck(4); // Platinum+
 * // Paste into your Leo program's finalize block
 */
export function generateLeoTierCheck(minTier: 1 | 2 | 3 | 4 | 5): string {
  const labels = ['', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
  return `
// ZeroLend Credit Passport — require ${labels[minTier]} (Tier ${minTier}) or higher
// Add to your Leo program's finalize block:

async function finalize_your_function(user: address) {
    let tier: u8 = Mapping::get_or_use(
        zerolend_lending_pool_v3.aleo/credit_passport,
        user,
        0u8
    );
    assert(tier >= ${minTier}u8); // Require ${labels[minTier]}+
}
`.trim();
}

/**
 * Full Leo program template for a tier-gated feature.
 * Replace YOUR_PROGRAM_NAME and the function body as needed.
 */
export const LEO_PROGRAM_TEMPLATE = `
import zerolend_lending_pool_v3.aleo;

program your_program.aleo {

    // Your records/mappings here...

    // ── Tier-gated transition ────────────────────────────────
    // Only Gold (tier 3+) wallets can call this function.
    async transition protected_action(
        // your inputs here
    ) -> Future {
        return finalize_protected_action(self.caller);
    }

    async function finalize_protected_action(user: address) {
        // Verify Credit Passport directly from ZeroLend's on-chain mapping
        let tier: u8 = Mapping::get_or_use(
            zerolend_lending_pool_v3.aleo/credit_passport,
            user,
            0u8
        );
        assert(tier >= 3u8); // Require Gold tier or higher

        // Your logic here...
    }
}
`.trim();