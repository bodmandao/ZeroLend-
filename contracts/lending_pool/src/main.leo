import credits.aleo;

program lending_pool.aleo {

    // ================================================================
    // RECORDS
    // ================================================================

    /// Full private credit data — only owner can see
    record CreditRecord {
        owner:             address,
        wallet_age_days:   u32,
        repayments_made:   u32,
        defaults:          u32,
        total_volume:      u64,   
        current_score:     u32,
        last_updated:      u32,
        nonce:             field,
    }

    /// Lightweight tier credential — proves tier only, zero raw data
    record CreditTierProof {
        owner:      address,
        tier:       u8,
        org_id:     field,
        expires_at: u32,
        nonce:      field,
    }

    /// Private loan record held by borrower
    record LoanRecord {
        owner:          address,
        loan_id:        field,
        principal:      u64,    // microcredits
        interest_rate:  u64,    // basis points per 1000 blocks
        borrowed_block: u32,
        due_block:      u32,
        tier_at_borrow: u8,
        nonce:          field,
    }

    /// Private deposit receipt held by lender
    record LenderDeposit {
        owner:            address,
        deposited_amount: u64,   // microcredits
        deposit_block:    u32,
        nonce:            field,
    }

    /// Oracle-signed off-chain credit attestation
    record OracleAttestation {
        owner:           address,
        attester:        address,
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u64,
        valid_until:     u32,
        attestation_id:  field,
    }

    // ================================================================
    // CONSTANTS
    // ================================================================

    // Interest rates per tier (basis points per 1000 blocks)
    const RATE_TIER_1: u64 = 2000u64; // 20% — Poor
    const RATE_TIER_2: u64 = 1500u64; // 15% — Fair
    const RATE_TIER_3: u64 = 1000u64; // 10% — Good
    const RATE_TIER_4: u64 =  700u64; //  7% — Great
    const RATE_TIER_5: u64 =  400u64; //  4% — Excellent

    // Max loan per tier in microcredits 
    const MAX_LOAN_TIER_1: u64 =    10_000_000u64; //    10 ALEO
    const MAX_LOAN_TIER_2: u64 =    50_000_000u64; //    50 ALEO
    const MAX_LOAN_TIER_3: u64 =   200_000_000u64; //   200 ALEO
    const MAX_LOAN_TIER_4: u64 = 1_000_000_000u64; // 1,000 ALEO
    const MAX_LOAN_TIER_5: u64 = 5_000_000_000u64; // 5,000 ALEO

    // Grace period before liquidation (~1 day at 10s/block)
    const GRACE_PERIOD: u32 = 8640u32;

    // ================================================================
    // MAPPINGS 
    // ================================================================

    mapping protocol_admin:       u8      => address;
    mapping approved_oracles:     address => bool;

    // Pool state
    mapping pool_liquidity:       u8      => u64;
    mapping pool_borrowed:        u8      => u64;
    mapping pool_interest_earned: u8      => u64;
    mapping active_loan_count:    u8      => u32;

    // Loan terms per tier 
    mapping loan_term_blocks:     u8      => u32;

    // Nullifier sets
    mapping loan_nullifiers:      field   => bool;
    mapping used_attestations:    field   => bool;

    // Public aggregate credit stats 
    mapping aggregate_tier_count: u8      => u32;

    // ================================================================
    // HELPER FUNCTIONS (pure)
    // ================================================================

    /// Compute credit score 0-1000 from raw inputs
    function compute_credit_score(
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u64
    ) -> u32 {
        // Age component: max 200 pts (2 pts/day, cap 100 days)
        let age_pts: u32 = wallet_age_days * 2u32;
        let age_cap: u32 = age_pts > 200u32 ? 200u32 : age_pts;

        // Repayment component: max 400 pts (10 pts each, cap 40)
        let rep_pts: u32 = repayments_made * 10u32;
        let rep_cap: u32 = rep_pts > 400u32 ? 400u32 : rep_pts;

        // Volume component: max 200 pts (1 pt per 1 ALEO = 1_000_000 microcredits)
        let vol_u32: u32 = (total_volume / 1_000_000u64) as u32;
        let vol_cap: u32 = vol_u32 > 200u32 ? 200u32 : vol_u32;

        // Base: 200 pts for any wallet
        let raw: u32     = 200u32 + age_cap + rep_cap + vol_cap;

        // Default penalty: -100 pts each
        let penalty: u32 = defaults * 100u32;
        let after: u32   = raw > penalty ? raw - penalty : 0u32;

        return after > 1000u32 ? 1000u32 : after;
    }

    /// Map score to tier band 1-5
    function score_to_tier(score: u32) -> u8 {
        if score >= 850u32 { return 5u8; }
        if score >= 700u32 { return 4u8; }
        if score >= 500u32 { return 3u8; }
        if score >= 300u32 { return 2u8; }
        return 1u8;
    }

    /// interest = principal * rate_bps * blocks / 10_000_000
    function compute_interest(
        principal:   u64,
        rate_bps:    u64,
        blocks_held: u32
    ) -> u64 {
        let blocks: u64 = blocks_held as u64;
        return (principal * rate_bps * blocks) / 10_000_000u64;
    }

    /// Get interest rate bps for tier
    function rate_for_tier(tier: u8) -> u64 {
        if tier == 5u8 { return RATE_TIER_5; }
        if tier == 4u8 { return RATE_TIER_4; }
        if tier == 3u8 { return RATE_TIER_3; }
        if tier == 2u8 { return RATE_TIER_2; }
        return RATE_TIER_1;
    }

    /// Get max loan microcredits for tier
    function max_loan_for_tier(tier: u8) -> u64 {
        if tier == 5u8 { return MAX_LOAN_TIER_5; }
        if tier == 4u8 { return MAX_LOAN_TIER_4; }
        if tier == 3u8 { return MAX_LOAN_TIER_3; }
        if tier == 2u8 { return MAX_LOAN_TIER_2; }
        return MAX_LOAN_TIER_1;
    }

   
    /// Initialize protocol. Caller becomes admin and first oracle.
    /// Call once after deployment — guarded against re-initialization.
    async transition initialize() -> Future {
        return finalize_initialize(self.caller);
    }

    async function finalize_initialize(admin: address) {
        let existing: address = Mapping::get_or_use(
            protocol_admin, 0u8,
            aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf
        );
        assert_eq(existing, aleo1handyyun9zlhv56sgkjc7qp3mg0fsk0d8aqamt49g3sds4nu4urqsudpkf);

        Mapping::set(protocol_admin,       0u8, admin);
        Mapping::set(approved_oracles,     admin, true);
        Mapping::set(pool_liquidity,       0u8, 0u64);
        Mapping::set(pool_borrowed,        0u8, 0u64);
        Mapping::set(pool_interest_earned, 0u8, 0u64);
        Mapping::set(active_loan_count,    0u8, 0u32);

        // Default loan terms per tier (in blocks)
        Mapping::set(loan_term_blocks, 1u8,  17280u32); // ~2 days
        Mapping::set(loan_term_blocks, 2u8,  43200u32); // ~5 days
        Mapping::set(loan_term_blocks, 3u8,  86400u32); // ~10 days
        Mapping::set(loan_term_blocks, 4u8, 172800u32); // ~20 days
        Mapping::set(loan_term_blocks, 5u8, 259200u32); // ~30 days
    }


    /// Admin whitelists an oracle address
    async transition add_oracle(oracle: address) -> Future {
        return finalize_add_oracle(self.caller, oracle);
    }

    async function finalize_add_oracle(caller: address, oracle: address) {
        let admin: address = Mapping::get(protocol_admin, 0u8);
        assert_eq(admin, caller);
        Mapping::set(approved_oracles, oracle, true);
    }

    /// Admin removes an oracle
    async transition remove_oracle(oracle: address) -> Future {
        return finalize_remove_oracle(self.caller, oracle);
    }

    async function finalize_remove_oracle(caller: address, oracle: address) {
        let admin: address = Mapping::get(protocol_admin, 0u8);
        assert_eq(admin, caller);
        Mapping::set(approved_oracles, oracle, false);
    }

    /// Oracle submits off-chain credit data and mints a private
    /// OracleAttestation record to the recipient's wallet.
    async transition attest_credit(
        recipient:        address,
        wallet_age_days:  u32,
        repayments_made:  u32,
        defaults:         u32,
        total_volume:     u64,
        valid_for_blocks: u32,
        current_block:    u32,
        attestation_id:   field
    ) -> (OracleAttestation, Future) {
        let att: OracleAttestation = OracleAttestation {
            owner:           recipient,
            attester:        self.caller,
            wallet_age_days: wallet_age_days,
            repayments_made: repayments_made,
            defaults:        defaults,
            total_volume:    total_volume,
            valid_until:     current_block + valid_for_blocks,
            attestation_id:  attestation_id,
        };
        return (att, finalize_attest_credit(self.caller, attestation_id));
    }

    async function finalize_attest_credit(oracle: address, attestation_id: field) {
        let approved: bool = Mapping::get_or_use(approved_oracles, oracle, false);
        assert(approved);
        let used: bool = Mapping::get_or_use(used_attestations, attestation_id, false);
        assert(!used);
        Mapping::set(used_attestations, attestation_id, true);
    }



    /// User redeems OracleAttestation to mint their private CreditRecord.
    /// Attestation is single-use and consumed here.
    async transition redeem_attestation(
        att:           OracleAttestation,
        current_block: u32,
        record_nonce:  field
    ) -> (CreditRecord, Future) {
        assert(current_block <= att.valid_until);
        assert_eq(att.owner, self.caller);

        let score: u32 = compute_credit_score(
            att.wallet_age_days,
            att.repayments_made,
            att.defaults,
            att.total_volume
        );

        let rec: CreditRecord = CreditRecord {
            owner:           att.owner,
            wallet_age_days: att.wallet_age_days,
            repayments_made: att.repayments_made,
            defaults:        att.defaults,
            total_volume:    att.total_volume,
            current_score:   score,
            last_updated:    current_block,
            nonce:           record_nonce,
        };

        let tier: u8 = score_to_tier(score);
        return (rec, finalize_redeem_attestation(tier));
    }

    async function finalize_redeem_attestation(tier: u8) {
        let count: u32 = Mapping::get_or_use(aggregate_tier_count, tier, 0u32);
        Mapping::set(aggregate_tier_count, tier, count + 1u32);
    }

    /// User generates a CreditTierProof from their CreditRecord.
    /// Reveals ONLY the tier number (1-5). Zero raw data exposed.
    transition prove_tier(
        rec:           CreditRecord,
        proof_nonce:   field,
        expires_in:    u32,
        current_block: u32,
        org_id:        field
    ) -> (CreditRecord, CreditTierProof) {
        let tier: u8 = score_to_tier(rec.current_score);

        // Re-issue record back to owner (Leo records are consumed on use)
        let returned_rec: CreditRecord = CreditRecord {
            owner:           rec.owner,
            wallet_age_days: rec.wallet_age_days,
            repayments_made: rec.repayments_made,
            defaults:        rec.defaults,
            total_volume:    rec.total_volume,
            current_score:   rec.current_score,
            last_updated:    rec.last_updated,
            nonce:           rec.nonce,
        };

        let proof: CreditTierProof = CreditTierProof {
            owner:      rec.owner,
            tier:       tier,
            org_id:     org_id,
            expires_at: current_block + expires_in,
            nonce:      proof_nonce,
        };

        return (returned_rec, proof);
    }

    /// Lender deposits ALEO credits into the pool.
    /// Returns change to lender + private LenderDeposit receipt.
    async transition deposit(
        input_credits: credits.aleo/credits,
        amount:        u64,
        current_block: u32,
        dep_nonce:     field
    ) -> (credits.aleo/credits, LenderDeposit, Future) {
        // Transfer amount to pool program address; return change to lender
        let (change, pool_receipt): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(input_credits, self.address, amount);

        let receipt: LenderDeposit = LenderDeposit {
            owner:            self.caller as address,
            deposited_amount: amount,
            deposit_block:    current_block,
            nonce:            dep_nonce,
        };

        return (change, receipt, finalize_deposit(amount));
    }

    async function finalize_deposit(amount: u64) {
        let liq: u64 = Mapping::get_or_use(pool_liquidity, 0u8, 0u64);
        Mapping::set(pool_liquidity, 0u8, liq + amount);
    }

    /// Lender withdraws principal + accrued yield.
    async transition withdraw(
        pool_credits:  credits.aleo/credits,
        receipt:       LenderDeposit,
        current_block: u32
    ) -> (credits.aleo/credits, credits.aleo/credits, Future) {
        assert_eq(receipt.owner, self.caller);

        let blocks: u32    = current_block - receipt.deposit_block;
        let yield_amt: u64 = compute_interest(receipt.deposited_amount, RATE_TIER_3, blocks);
        let total: u64     = receipt.deposited_amount + yield_amt;

        // Send principal + yield to lender; keep remainder in pool
        let (payout, pool_change): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(pool_credits, self.caller, total);

        return (payout, pool_change, finalize_withdraw(receipt.deposited_amount, yield_amt));
    }

    async function finalize_withdraw(principal: u64, yield_paid: u64) {
        let liq: u64 = Mapping::get(pool_liquidity, 0u8);
        assert(liq >= principal + yield_paid);
        Mapping::set(pool_liquidity, 0u8, liq - principal - yield_paid);

        let earned: u64 = Mapping::get_or_use(pool_interest_earned, 0u8, 0u64);
        if earned >= yield_paid {
            Mapping::set(pool_interest_earned, 0u8, earned - yield_paid);
        }
    }


    /// Borrower requests a loan using their CreditTierProof.
    /// Pool transfers ALEO credits privately to borrower.
    async transition request_loan(
        proof:        CreditTierProof,
        pool_credits: credits.aleo/credits,
        amount:       u64,
        current_block: u32,
        loan_nonce:   field,
        loan_id:      field
    ) -> (CreditTierProof, LoanRecord, credits.aleo/credits, credits.aleo/credits, Future) {
        // Proof must be unexpired
        assert(current_block <= proof.expires_at);

        // Amount within tier limit and positive
        let max_loan: u64 = max_loan_for_tier(proof.tier);
        assert(amount <= max_loan);
        assert(amount > 0u64);

        let rate: u64 = rate_for_tier(proof.tier);

        // Re-issue tier proof back to borrower
        let returned_proof: CreditTierProof = CreditTierProof {
            owner:      proof.owner,
            tier:       proof.tier,
            org_id:     proof.org_id,
            expires_at: proof.expires_at,
            nonce:      proof.nonce,
        };

        // Private loan record stored in borrower's wallet
        let loan: LoanRecord = LoanRecord {
            owner:          proof.owner,
            loan_id:        loan_id,
            principal:      amount,
            interest_rate:  rate,
            borrowed_block: current_block,
            due_block:      current_block + 86400u32, // ~10 days default
            tier_at_borrow: proof.tier,
            nonce:          loan_nonce,
        };

        // Privately send loan amount from pool to borrower
        let (loan_funds, pool_change): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(pool_credits, proof.owner, amount);

        return (
            returned_proof,
            loan,
            loan_funds,
            pool_change,
            finalize_request_loan(amount, loan_id)
        );
    }

    async function finalize_request_loan(amount: u64, loan_id: field) {
        // Nullifier: prevent loan_id reuse
        let used: bool = Mapping::get_or_use(loan_nullifiers, loan_id, false);
        assert(!used);
        Mapping::set(loan_nullifiers, loan_id, true);

        // Pool must have sufficient available liquidity
        let liq: u64 = Mapping::get_or_use(pool_liquidity, 0u8, 0u64);
        let bor: u64 = Mapping::get_or_use(pool_borrowed,  0u8, 0u64);
        assert(liq - bor >= amount);

        Mapping::set(pool_borrowed, 0u8, bor + amount);

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        Mapping::set(active_loan_count, 0u8, lc + 1u32);
    }

    /// Borrower repays loan (principal + interest) using credits.aleo.
    /// Credit record updated: repayments_made++, score recalculated.
    async transition repay_loan(
        loan:          LoanRecord,
        payment:       credits.aleo/credits,
        rec:           CreditRecord,
        current_block: u32,
        new_rec_nonce: field
    ) -> (credits.aleo/credits, CreditRecord, Future) {
        assert_eq(loan.owner, rec.owner);
        assert_eq(loan.owner, self.caller);

        let blocks: u32   = current_block - loan.borrowed_block;
        let interest: u64 = compute_interest(loan.principal, loan.interest_rate, blocks);
        let owed: u64     = loan.principal + interest;

        assert(payment.microcredits >= owed);

        // Send owed amount to pool; return change to borrower
        let (pool_receipt, change): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(payment, self.address, owed);

        // Update credit record — successful repayment
        let new_reps: u32  = rec.repayments_made + 1u32;
        let new_vol: u64   = rec.total_volume + loan.principal;
        let new_score: u32 = compute_credit_score(
            rec.wallet_age_days, new_reps, rec.defaults, new_vol
        );

        let old_tier: u8 = score_to_tier(rec.current_score);
        let new_tier: u8 = score_to_tier(new_score);

        let updated_rec: CreditRecord = CreditRecord {
            owner:           rec.owner,
            wallet_age_days: rec.wallet_age_days,
            repayments_made: new_reps,
            defaults:        rec.defaults,
            total_volume:    new_vol,
            current_score:   new_score,
            last_updated:    current_block,
            nonce:           new_rec_nonce,
        };

        return (change, updated_rec, finalize_repay_loan(loan.principal, interest, old_tier, new_tier));
    }

    async function finalize_repay_loan(
        principal: u64,
        interest:  u64,
        old_tier:  u8,
        new_tier:  u8
    ) {
        let bor: u64 = Mapping::get(pool_borrowed, 0u8);
        assert(bor >= principal);
        Mapping::set(pool_borrowed, 0u8, bor - principal);

        let earned: u64 = Mapping::get_or_use(pool_interest_earned, 0u8, 0u64);
        Mapping::set(pool_interest_earned, 0u8, earned + interest);

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        if lc > 0u32 { Mapping::set(active_loan_count, 0u8, lc - 1u32); }

        // Shift aggregate tier counters
        let old_count: u32 = Mapping::get_or_use(aggregate_tier_count, old_tier, 0u32);
        if old_count > 0u32 {
            Mapping::set(aggregate_tier_count, old_tier, old_count - 1u32);
        }
        let new_count: u32 = Mapping::get_or_use(aggregate_tier_count, new_tier, 0u32);
        Mapping::set(aggregate_tier_count, new_tier, new_count + 1u32);
    }

    /// Liquidate an overdue loan — callable by anyone after due_block + GRACE_PERIOD.
    /// Borrower's credit record penalized: defaults++, score drops.
    async transition liquidate(
        loan:          LoanRecord,
        rec:           CreditRecord,
        current_block: u32,
        new_rec_nonce: field
    ) -> (CreditRecord, Future) {
        assert_eq(loan.owner, rec.owner);
        assert(current_block > loan.due_block + GRACE_PERIOD);

        let new_defaults: u32 = rec.defaults + 1u32;
        let new_score: u32    = compute_credit_score(
            rec.wallet_age_days, rec.repayments_made, new_defaults, rec.total_volume
        );

        let old_tier: u8 = score_to_tier(rec.current_score);
        let new_tier: u8 = score_to_tier(new_score);

        let penalized: CreditRecord = CreditRecord {
            owner:           rec.owner,
            wallet_age_days: rec.wallet_age_days,
            repayments_made: rec.repayments_made,
            defaults:        new_defaults,
            total_volume:    rec.total_volume,
            current_score:   new_score,
            last_updated:    current_block,
            nonce:           new_rec_nonce,
        };

        return (penalized, finalize_liquidate(loan.principal, old_tier, new_tier));
    }

    async function finalize_liquidate(principal: u64, old_tier: u8, new_tier: u8) {
        let bor: u64 = Mapping::get_or_use(pool_borrowed, 0u8, 0u64);
        Mapping::set(
            pool_borrowed, 0u8,
            bor >= principal ? bor - principal : 0u64
        );

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        if lc > 0u32 { Mapping::set(active_loan_count, 0u8, lc - 1u32); }

        let old_count: u32 = Mapping::get_or_use(aggregate_tier_count, old_tier, 0u32);
        if old_count > 0u32 {
            Mapping::set(aggregate_tier_count, old_tier, old_count - 1u32);
        }
        let new_count: u32 = Mapping::get_or_use(aggregate_tier_count, new_tier, 0u32);
        Mapping::set(aggregate_tier_count, new_tier, new_count + 1u32);
    }


    /// Publicly proves pool solvency: borrowed <= liquidity.
    async transition prove_solvency() -> Future {
        return finalize_prove_solvency();
    }

    async function finalize_prove_solvency() {
        let liq: u64 = Mapping::get_or_use(pool_liquidity, 0u8, 0u64);
        let bor: u64 = Mapping::get_or_use(pool_borrowed,  0u8, 0u64);
        assert(bor <= liq);
    }
}
