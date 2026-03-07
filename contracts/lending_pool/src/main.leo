// ============================================================
// Undercollateralized private lending pool.
//   - Lenders deposit tokens to earn yield
//   - Borrowers present CreditTierProof to get loans
//   - Loan records are private
//   - Repayment updates credit score
//   - Liquidation on default
// ============================================================

import credit_score.aleo;
import private_token.aleo;

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
    // MAPPINGS — public pool state
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

    /// Lender deposits USDC into the pool.
    async transition deposit(
        token:         private_token.aleo/Token,
        amount:        u128,
        current_block: u32,
        deposit_nonce: field
    ) -> (private_token.aleo/Token, LenderDeposit, Future) {
        assert_eq(token.token_id, USDC_TOKEN_ID);
        assert(token.amount >= amount);

        let change: private_token.aleo/Token = private_token.aleo/Token {
            owner:    token.owner,
            token_id: USDC_TOKEN_ID,
            amount:   token.amount - amount,
        };

        let receipt: LenderDeposit = LenderDeposit {
            owner:            token.owner,
            pool_id:          POOL_ID,
            token_id:         USDC_TOKEN_ID,
            deposited_amount: amount,
            deposit_block:    current_block,
            share_nonce:      deposit_nonce,
        };

        return (change, receipt,finalize_deposit(amount)) ;
    }

    async function finalize_deposit(amount: u128) {
        let liquidity: u128 = Mapping::get_or_use(pool_liquidity, USDC_TOKEN_ID, 0u128);
        Mapping::set(pool_liquidity, USDC_TOKEN_ID, liquidity + amount);
    }

    /// Borrower requests a loan using their CreditTierProof.
    /// The tier proof is consumed — borrower must re-generate for next loan.
    transition request_loan(
        tier_proof:    credit_score.aleo/CreditTierProof,
        amount:        u128,
        current_block: u32,
        loan_nonce:    field,
        loan_id:       field
    ) -> (credit_score.aleo/CreditTierProof, LoanRecord, private_token.aleo/Token, Future) {
        // Verify tier proof isn't expired
        assert(current_block <= tier_proof.expires_at);

        // Verify amount doesn't exceed tier max
        let max_loan: u128 = get_max_loan_for_tier(tier_proof.tier);
        assert(amount <= max_loan);

        // Compute interest rate for this tier
        let rate: u64 = get_rate_for_tier(tier_proof.tier);

        // Return the tier proof to borrower (consumed by transition, re-issued)
        let returned_proof: credit_score.aleo/CreditTierProof = credit_score.aleo/CreditTierProof {
            owner:      tier_proof.owner,
            tier:       tier_proof.tier,
            org_id:     tier_proof.org_id,
            expires_at: tier_proof.expires_at,
            nonce:      tier_proof.nonce,
        };

        // Private loan record for borrower
        let loan: LoanRecord = LoanRecord {
            owner:          tier_proof.owner,
            loan_id:        loan_id,
            pool_id:        POOL_ID,
            token_id:       USDC_TOKEN_ID,
            principal:      amount,
            interest_rate:  rate,
            borrowed_block: current_block,
            due_block:      0u32, // filled in finalize via mapping
            tier_at_borrow: tier_proof.tier,
            nonce:          loan_nonce,
        };

        // Loan funds minted to borrower as private token record
        let loan_funds: private_token.aleo/Token = private_token.aleo/Token {
            owner:    tier_proof.owner,
            token_id: USDC_TOKEN_ID,
            amount:   amount,
        };

        return (returned_proof, loan, loan_funds, finalize_request_loan(amount, loan_id, tier_proof.tier, current_block));
    }

    async function finalize_request_loan(
        amount:        u128,
        loan_id:       field,
        tier:          u8,
        current_block: u32
    ) {
        // Ensure loan_id hasn't been used
        let used: bool = Mapping::get_or_use(loan_nullifiers, loan_id, false);
        assert(!used);
        Mapping::set(loan_nullifiers, loan_id, true);

        // Check pool has sufficient liquidity
        let liquidity: u128 = Mapping::get(pool_liquidity, USDC_TOKEN_ID);
        let borrowed:  u128 = Mapping::get_or_use(pool_borrowed, USDC_TOKEN_ID, 0u128);
        let available: u128 = liquidity - borrowed;
        assert(available >= amount);

        // Update borrowed amount
        Mapping::set(pool_borrowed, USDC_TOKEN_ID, borrowed + amount);

        // Increment active loan count
        let lc: u32 = Mapping::get_or_use(active_loan_count, POOL_ID, 0u32);
        Mapping::set(active_loan_count, POOL_ID, lc + 1u32);
    }

    /// Borrower repays their loan (principal + interest).
    /// Returns updated credit record with repayment noted.
    transition repay_loan(
        loan:            LoanRecord,
        repayment_token: private_token.aleo/Token,
        credit_record:   credit_score.aleo/CreditRecord,
        current_block:   u32,
        new_nonce:       field,
        new_credit_nonce: field
    ) -> (private_token.aleo/Token, credit_score.aleo/CreditRecord, Future) {
        assert_eq(loan.token_id, repayment_token.token_id);
        assert_eq(loan.owner, credit_record.owner);

        // Compute interest owed
        let blocks_held: u32 = current_block - loan.borrowed_block;
        let interest: u128 = compute_interest(
            loan.principal,
            loan.interest_rate,
            blocks_held
        );
        let total_owed: u128 = loan.principal + interest;

        // Ensure borrower has enough to repay
        assert(repayment_token.amount >= total_owed);

        // Change back to borrower
        let change: private_token.aleo/Token = private_token.aleo/Token {
            owner:    repayment_token.owner,
            token_id: repayment_token.token_id,
            amount:   repayment_token.amount - total_owed,
        };

        // Update credit record — successful repayment
        let new_repayments: u32 = credit_record.repayments_made + 1u32;
        let new_volume: u128 = credit_record.total_volume + loan.principal;
        let new_score: u32 = credit_score.aleo/compute_credit_score(
            credit_record.wallet_age_days,
            new_repayments,
            credit_record.defaults,
            new_volume
        );

        let updated_credit: credit_score.aleo/CreditRecord = credit_score.aleo/CreditRecord {
            owner:           credit_record.owner,
            wallet_age_days: credit_record.wallet_age_days,
            repayments_made: new_repayments,
            defaults:        credit_record.defaults,
            total_volume:    new_volume,
            current_score:   new_score,
            last_updated:    current_block,
            nonce:           new_credit_nonce,
        };

        return (change, updated_credit,finalize_repay_loan(loan.principal, interest, loan.loan_id));
    }

    async function finalize_repay_loan(principal: u128, interest: u128, loan_id: field) {
        // Reduce borrowed
        let borrowed: u128 = Mapping::get(pool_borrowed, USDC_TOKEN_ID);
        assert(borrowed >= principal);
        Mapping::set(pool_borrowed, USDC_TOKEN_ID, borrowed - principal);

        // Add interest to earned
        let earned: u128 = Mapping::get_or_use(pool_interest_earned, USDC_TOKEN_ID, 0u128);
        Mapping::set(pool_interest_earned, USDC_TOKEN_ID, earned + interest);

        // Reduce active loan count
        let lc: u32 = Mapping::get_or_use(active_loan_count, POOL_ID, 0u32);
        if lc > 0u32 {
            Mapping::set(active_loan_count, POOL_ID, lc - 1u32);
        }
    }

    /// Liquidate an overdue loan. Anyone can call after grace period.
    /// Borrower's credit record is penalized.
    async transition liquidate(
        loan:          LoanRecord,
        credit_record: credit_score.aleo/CreditRecord,
        current_block: u32,
        new_credit_nonce: field
    ) -> (  credit_score.aleo/CreditRecord, Future) {
        assert_eq(loan.owner, credit_record.owner);

        // Must be past due + grace period to liquidate
        assert(current_block > loan.due_block + GRACE_PERIOD);

        // Penalize credit — record a default
        let new_defaults: u32 = credit_record.defaults + 1u32;
        let new_score: u32 = credit_score.aleo/compute_credit_score(
            credit_record.wallet_age_days,
            credit_record.repayments_made,
            new_defaults,
            credit_record.total_volume
        );

        let penalized_credit: credit_score.aleo/CreditRecord = credit_score.aleo/CreditRecord {
            owner:           credit_record.owner,
            wallet_age_days: credit_record.wallet_age_days,
            repayments_made: credit_record.repayments_made,
            defaults:        new_defaults,
            total_volume:    credit_record.total_volume,
            current_score:   new_score,
            last_updated:    current_block,
            nonce:           new_credit_nonce,
        };

        let old_tier: u8 = credit_score.aleo/score_to_tier(credit_record.current_score);
        let new_tier: u8 = credit_score.aleo/score_to_tier(new_score);

        return (penalized_credit, finalize_liquidate(loan.principal, loan.loan_id, old_tier, new_tier));
    }

    async function finalize_liquidate(
        principal: u128,
        loan_id:   field,
        old_tier:  u8,
        new_tier:  u8
    ) {
        // Write-off the bad debt from borrowed
        let borrowed: u128 = Mapping::get(pool_borrowed, USDC_TOKEN_ID);
        if borrowed >= principal {
            Mapping::set(pool_borrowed, USDC_TOKEN_ID, borrowed - principal);
        } else {
            Mapping::set(pool_borrowed, USDC_TOKEN_ID, 0u128);
        }

        // Reduce active loan count
        let lc: u32 = Mapping::get_or_use(active_loan_count, POOL_ID, 0u32);
        if lc > 0u32 {
            Mapping::set(active_loan_count, POOL_ID, lc - 1u32);
        }
    }

    /// Lender withdraws their deposit + pro-rata yield.
    async transition withdraw(
        receipt:       LenderDeposit,
        current_block: u32,
        new_nonce:     field
    ) -> (private_token.aleo/Token, Future) {
        // Yield is distributed proportionally to deposit size and time
        let blocks_deposited: u32 = current_block - receipt.deposit_block;

        // Simple yield: same interest formula as loans (at Tier 3 rate)
        let yield_earned: u128 = compute_interest(
            receipt.deposited_amount,
            RATE_TIER_3,
            blocks_deposited
        );

        let total_withdrawal: u128 = receipt.deposited_amount + yield_earned;

        let payout: private_token.aleo/Token = private_token.aleo/Token {
            owner:    receipt.owner,
            token_id: USDC_TOKEN_ID,
            amount:   total_withdrawal,
        };

        return (payout, finalize_withdraw(receipt.deposited_amount, yield_earned));
    }

    async function finalize_withdraw(principal: u128, yield_paid: u128) {
        let liquidity: u128 = Mapping::get(pool_liquidity, USDC_TOKEN_ID);
        assert(liquidity >= principal + yield_paid);
        Mapping::set(pool_liquidity, USDC_TOKEN_ID, liquidity - principal - yield_paid);

        // Deduct from earned interest
        let earned: u128 = Mapping::get_or_use(pool_interest_earned, USDC_TOKEN_ID, 0u128);
        if earned >= yield_paid {
            Mapping::set(pool_interest_earned, USDC_TOKEN_ID, earned - yield_paid);
        }
    }

    async transition get_utilization() -> (Future) {
        return (finalize_get_utilization());
    }

    async function finalize_get_utilization() {
        let liquidity: u128 = Mapping::get_or_use(pool_liquidity, USDC_TOKEN_ID, 1u128);
        let borrowed:  u128 = Mapping::get_or_use(pool_borrowed,  USDC_TOKEN_ID, 0u128);
        assert(borrowed <= liquidity);
    }
}