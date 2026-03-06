// The 'lending_pool' program.
program lending_pool.aleo {
     // ----------------------------------------------------------------
    // CONSTANTS
    // ----------------------------------------------------------------

    // Token IDs (must match private_token.aleo initialization)
    const USDC_TOKEN_ID: field = 1field;
    const ALEO_TOKEN_ID: field = 2field;

    // Pool ID
    const POOL_ID: field = 100field;

    // Interest rates per tier (basis points per 1000 blocks, ~annualized)
    // Tier 1 = 2000 bps = 20%,  Tier 5 = 400 bps = 4%
    const RATE_TIER_1: u64 = 2000u64;
    const RATE_TIER_2: u64 = 1500u64;
    const RATE_TIER_3: u64 = 1000u64;
    const RATE_TIER_4: u64 = 700u64;
    const RATE_TIER_5: u64 = 400u64;

    // Max loan-to-limit per tier (in microcredits / USDC micro units)
    const MAX_LOAN_TIER_1: u128 = 100_000_000u128;   // 100 USDC
    const MAX_LOAN_TIER_2: u128 = 500_000_000u128;   // 500 USDC
    const MAX_LOAN_TIER_3: u128 = 2_000_000_000u128; // 2,000 USDC
    const MAX_LOAN_TIER_4: u128 = 10_000_000_000u128; // 10,000 USDC
    const MAX_LOAN_TIER_5: u128 = 50_000_000_000u128; // 50,000 USDC

    // Grace period before liquidation (in blocks, ~1 block = 10s)
    const GRACE_PERIOD: u32 = 8640u32; // ~1 day

    // ----------------------------------------------------------------
    // RECORDS
    // ----------------------------------------------------------------

    /// Private deposit receipt — held by lender.
    record LenderDeposit {
        owner:           address,
        pool_id:         field,
        token_id:        field,
        deposited_amount: u128,
        deposit_block:   u32,
        share_nonce:     field, // prevents correlation
    }

    /// Private loan record — held by borrower.
    record LoanRecord {
        owner:          address,
        loan_id:        field,
        pool_id:        field,
        token_id:       field,
        principal:      u128,
        interest_rate:  u64,   // bps per 1000 blocks
        borrowed_block: u32,
        due_block:      u32,   // block height when repayment is due
        tier_at_borrow: u8,
        nonce:          field,
    }

     // ----------------------------------------------------------------
    // MAPPINGS 
    // ----------------------------------------------------------------

    /// Total liquidity in pool per token
    mapping pool_liquidity: field => u128;  // token_id => amount

    /// Total borrowed per token
    mapping pool_borrowed: field => u128;

    /// Total interest collected (for yield distribution)
    mapping pool_interest_earned: field => u128;

    /// Count of active loans (for solvency dashboard)
    mapping active_loan_count: field => u32;

    /// Protocol admin
    mapping pool_admin: u8 => address;

    /// Loan term in blocks per tier (how long borrowers have to repay)
    mapping loan_term_blocks: u8 => u32;

    /// Nullifier set — prevents loan_id reuse
    mapping loan_nullifiers: field => bool;

     // ----------------------------------------------------------------
    // HELPER FUNCTIONS
    // ----------------------------------------------------------------

    /// Compute interest accrued on a loan.
    function compute_interest(
        principal:     u128,
        rate_bps:      u64,
        blocks_held:   u32
    ) -> u128 {
        // interest = principal * rate_bps * blocks / (10000 * 1000)
        // Using u128 to avoid overflow
        let rate: u128 = rate_bps as u128;
        let blocks: u128 = blocks_held as u128;
        let numerator: u128 = principal * rate * blocks;
        let denominator: u128 = 10_000_000u128; // 10000 bps * 1000 blocks
        return numerator / denominator;
    }

    /// Get interest rate for a tier.
    function get_rate_for_tier(tier: u8) -> u64 {
        if tier == 5u8 { return RATE_TIER_5; }
        if tier == 4u8 { return RATE_TIER_4; }
        if tier == 3u8 { return RATE_TIER_3; }
        if tier == 2u8 { return RATE_TIER_2; }
        return RATE_TIER_1;
    }

    /// Get max loan for a tier.
    function get_max_loan_for_tier(tier: u8) -> u128 {
        if tier == 5u8 { return MAX_LOAN_TIER_5; }
        if tier == 4u8 { return MAX_LOAN_TIER_4; }
        if tier == 3u8 { return MAX_LOAN_TIER_3; }
        if tier == 2u8 { return MAX_LOAN_TIER_2; }
        return MAX_LOAN_TIER_1;
    }

    // ----------------------------------------------------------------
    // TRANSITIONS
    // ----------------------------------------------------------------

    /// Initialize the lending pool. Called once by deployer.
    transition initialize(
        usdc_initial_liquidity: u128,
        usdc_token:             private_token.aleo/Token
    ) -> (private_token.aleo/Token, LenderDeposit,Future) {
        assert_eq(usdc_token.token_id, USDC_TOKEN_ID);
        assert(usdc_token.amount >= usdc_initial_liquidity);

        let change_amount: u128 = usdc_token.amount - usdc_initial_liquidity;

        // Return change to deployer
        let change: private_token.aleo/Token = private_token.aleo/Token {
            owner:    usdc_token.owner,
            token_id: USDC_TOKEN_ID,
            amount:   change_amount,
        };

        // Deployer's deposit receipt
        let deposit_nonce: field = BHP256::hash_to_field(self.caller);
        let receipt: LenderDeposit = LenderDeposit {
            owner:            usdc_token.owner,
            pool_id:          POOL_ID,
            token_id:         USDC_TOKEN_ID,
            deposited_amount: usdc_initial_liquidity,
            deposit_block:    0u32,
            share_nonce:      deposit_nonce,
        };

        return (change, receipt, finalize_initialize(
            self.caller,
            usdc_initial_liquidity
        ));
    }

     async function finalize_initialize(admin: address, initial_liquidity: u128) {
        let existing: u128 = Mapping::get_or_use(pool_liquidity, USDC_TOKEN_ID, 0u128);
        assert_eq(existing, 0u128); // ensure fresh pool
        Mapping::set(pool_admin, 0u8, admin);
        Mapping::set(pool_liquidity, USDC_TOKEN_ID, initial_liquidity);
        Mapping::set(pool_borrowed, USDC_TOKEN_ID, 0u128);
        Mapping::set(pool_interest_earned, USDC_TOKEN_ID, 0u128);
        Mapping::set(active_loan_count, POOL_ID, 0u32);

        // Set default loan terms per tier (in blocks)
        Mapping::set(loan_term_blocks, 1u8, 17280u32);  // ~2 days
        Mapping::set(loan_term_blocks, 2u8, 43200u32);  // ~5 days
        Mapping::set(loan_term_blocks, 3u8, 86400u32);  // ~10 days
        Mapping::set(loan_term_blocks, 4u8, 172800u32); // ~20 days
        Mapping::set(loan_term_blocks, 5u8, 259200u32); // ~30 days
    }
}
