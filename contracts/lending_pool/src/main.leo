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

}
