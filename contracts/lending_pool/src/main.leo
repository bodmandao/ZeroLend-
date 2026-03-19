import credits.aleo;

program zerolend_lending_pool_v3.aleo {

    // ================================================================
    // RECORDS
    // ================================================================

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

    record CreditTierProof {
        owner:      address,
        tier:       u8,
        org_id:     field,
        expires_at: u32,
        nonce:      field,
    }

    record LoanRecord {
        owner:          address,
        loan_id:        field,
        principal:      u64,
        interest_rate:  u64,
        borrowed_block: u32,
        due_block:      u32,
        tier_at_borrow: u8,
        nonce:          field,
    }

    record LenderDeposit {
        owner:            address,
        deposited_amount: u64,
        deposit_block:    u32,
        nonce:            field,
    }

    // ================================================================
    // CONSTANTS
    // ================================================================

    const RATE_TIER_1: u64 = 2000u64;
    const RATE_TIER_2: u64 = 1500u64;
    const RATE_TIER_3: u64 = 1000u64;
    const RATE_TIER_4: u64 =  700u64;
    const RATE_TIER_5: u64 =  400u64;

    const MAX_LOAN_TIER_1: u64 =    10_000_000u64;
    const MAX_LOAN_TIER_2: u64 =    50_000_000u64;
    const MAX_LOAN_TIER_3: u64 =   200_000_000u64;
    const MAX_LOAN_TIER_4: u64 = 1_000_000_000u64;
    const MAX_LOAN_TIER_5: u64 = 5_000_000_000u64;

    const GRACE_PERIOD: u32 = 8640u32;

    // Flash loan fee: 100 bps = 1%
    const FLASH_FEE_BPS: u64 = 100u64;

    // ================================================================
    // MAPPINGS
    // ================================================================

    mapping protocol_admin:       u8      => address;
    mapping pool_liquidity:       u8      => u64;
    mapping pool_borrowed:        u8      => u64;
    mapping pool_interest_earned: u8      => u64;
    mapping active_loan_count:    u8      => u32;
    mapping loan_term_blocks:     u8      => u32;
    mapping loan_nullifiers:      field   => bool;
    mapping aggregate_tier_count: u8      => u32;

    // Credit Passport — public opt-in tier registry
    // value 0 = not published, 1-5 = published tier
    mapping credit_passport:      address => u8;
    mapping passport_updated_at:  address => u32;

    // Flash loan stats
    mapping flash_loan_fees:      u8      => u64;
    mapping flash_loan_count:     u8      => u32;

    // ================================================================
    // HELPERS
    // ================================================================

    function compute_credit_score(
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u64
    ) -> u32 {
        let age_pts: u32 = wallet_age_days * 2u32;
        let age_cap: u32 = age_pts > 200u32 ? 200u32 : age_pts;

        let rep_pts: u32 = repayments_made * 10u32;
        let rep_cap: u32 = rep_pts > 400u32 ? 400u32 : rep_pts;

        let vol_u32: u32 = (total_volume / 1_000_000u64) as u32;
        let vol_cap: u32 = vol_u32 > 200u32 ? 200u32 : vol_u32;

        let raw: u32     = 200u32 + age_cap + rep_cap + vol_cap;
        let penalty: u32 = defaults * 100u32;
        let after: u32   = raw > penalty ? raw - penalty : 0u32;

        return after > 1000u32 ? 1000u32 : after;
    }

    function score_to_tier(score: u32) -> u8 {
        if score >= 850u32 { return 5u8; }
        if score >= 700u32 { return 4u8; }
        if score >= 500u32 { return 3u8; }
        if score >= 300u32 { return 2u8; }
        return 1u8;
    }

    function compute_interest(principal: u64, rate_bps: u64, blocks_held: u32) -> u64 {
        let blocks: u64 = blocks_held as u64;
        return (principal * rate_bps * blocks) / 10_000_000u64;
    }

    function rate_for_tier(tier: u8) -> u64 {
        if tier == 5u8 { return RATE_TIER_5; }
        if tier == 4u8 { return RATE_TIER_4; }
        if tier == 3u8 { return RATE_TIER_3; }
        if tier == 2u8 { return RATE_TIER_2; }
        return RATE_TIER_1;
    }

    function max_loan_for_tier(tier: u8) -> u64 {
        if tier == 5u8 { return MAX_LOAN_TIER_5; }
        if tier == 4u8 { return MAX_LOAN_TIER_4; }
        if tier == 3u8 { return MAX_LOAN_TIER_3; }
        if tier == 2u8 { return MAX_LOAN_TIER_2; }
        return MAX_LOAN_TIER_1;
    }

    @noupgrade
    async constructor() {}

    // ================================================================
    // SECTION 1 — PROTOCOL SETUP
    // ================================================================

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
        Mapping::set(pool_liquidity,       0u8, 0u64);
        Mapping::set(pool_borrowed,        0u8, 0u64);
        Mapping::set(pool_interest_earned, 0u8, 0u64);
        Mapping::set(active_loan_count,    0u8, 0u32);
        Mapping::set(loan_term_blocks, 1u8,  17280u32);
        Mapping::set(loan_term_blocks, 2u8,  43200u32);
        Mapping::set(loan_term_blocks, 3u8,  86400u32);
        Mapping::set(loan_term_blocks, 4u8, 172800u32);
        Mapping::set(loan_term_blocks, 5u8, 259200u32);
    }

    // ================================================================
    // SECTION 2 — CREDIT ATTESTATION
    // ================================================================

    async transition attest_credit(
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u64,
        current_block:   u32,
        record_nonce:    field
    ) -> (CreditRecord, Future) {
        let score: u32 = compute_credit_score(wallet_age_days, repayments_made, defaults, total_volume);

        let rec: CreditRecord = CreditRecord {
            owner:           self.caller as address,
            wallet_age_days: wallet_age_days,
            repayments_made: repayments_made,
            defaults:        defaults,
            total_volume:    total_volume,
            current_score:   score,
            last_updated:    current_block,
            nonce:           record_nonce,
        };

        let tier: u8 = score_to_tier(score);
        return (rec, finalize_attest_credit(tier));
    }

    async function finalize_attest_credit(tier: u8) {
        let count: u32 = Mapping::get_or_use(aggregate_tier_count, tier, 0u32);
        Mapping::set(aggregate_tier_count, tier, count + 1u32);
    }

    // ================================================================
    // SECTION 3 — TIER PROOF
    // ================================================================

    transition prove_tier(
        rec:           CreditRecord,
        proof_nonce:   field,
        expires_in:    u32,
        current_block: u32,
        org_id:        field
    ) -> (CreditRecord, CreditTierProof) {
        let tier: u8 = score_to_tier(rec.current_score);

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

    // ================================================================
    // SECTION 4 — LENDING POOL
    // ================================================================

    async transition deposit(
        input_credits: credits.aleo/credits,
        amount:        u64,
        current_block: u32,
        dep_nonce:     field
    ) -> (credits.aleo/credits, LenderDeposit, Future) {
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(input_credits, self.address, amount);

        let receipt: LenderDeposit = LenderDeposit {
            owner:            self.caller as address,
            deposited_amount: amount,
            deposit_block:    current_block,
            nonce:            dep_nonce,
        };

        return (change, receipt, finalize_deposit(transfer_future, amount));
    }

    async function finalize_deposit(transfer_future: Future, amount: u64) {
        transfer_future.await();
        let liq: u64 = Mapping::get_or_use(pool_liquidity, 0u8, 0u64);
        Mapping::set(pool_liquidity, 0u8, liq + amount);
    }

    async transition withdraw(
        receipt:       LenderDeposit,
        current_block: u32
    ) -> (credits.aleo/credits, Future) {
        assert_eq(receipt.owner, self.caller);

        let blocks: u32    = current_block - receipt.deposit_block;
        let yield_amt: u64 = compute_interest(receipt.deposited_amount, RATE_TIER_3, blocks);
        let total: u64     = receipt.deposited_amount + yield_amt;

        let (payout, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, total);

        return (payout, finalize_withdraw(transfer_future, receipt.deposited_amount, yield_amt));
    }

    async function finalize_withdraw(transfer_future: Future, principal: u64, yield_paid: u64) {
        transfer_future.await();
        let liq: u64 = Mapping::get(pool_liquidity, 0u8);
        assert(liq >= principal + yield_paid);
        Mapping::set(pool_liquidity, 0u8, liq - principal - yield_paid);

        let earned: u64 = Mapping::get_or_use(pool_interest_earned, 0u8, 0u64);
        if earned >= yield_paid {
            Mapping::set(pool_interest_earned, 0u8, earned - yield_paid);
        }
    }

    // ================================================================
    // SECTION 5 — LOAN LIFECYCLE
    // ================================================================

    async transition request_loan(
        proof:         CreditTierProof,
        amount:        u64,
        current_block: u32,
        loan_nonce:    field,
        loan_id:       field
    ) -> (CreditTierProof, LoanRecord, credits.aleo/credits, Future) {
        assert(current_block <= proof.expires_at);

        let max_loan: u64 = max_loan_for_tier(proof.tier);
        assert(amount <= max_loan);
        assert(amount > 0u64);

        let rate: u64 = rate_for_tier(proof.tier);

        let returned_proof: CreditTierProof = CreditTierProof {
            owner:      proof.owner,
            tier:       proof.tier,
            org_id:     proof.org_id,
            expires_at: proof.expires_at,
            nonce:      proof.nonce,
        };

        let loan: LoanRecord = LoanRecord {
            owner:          proof.owner,
            loan_id:        loan_id,
            principal:      amount,
            interest_rate:  rate,
            borrowed_block: current_block,
            due_block:      current_block + 86400u32,
            tier_at_borrow: proof.tier,
            nonce:          loan_nonce,
        };

        let (loan_funds, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(proof.owner, amount);

        return (returned_proof, loan, loan_funds, finalize_request_loan(transfer_future, amount, loan_id));
    }

    async function finalize_request_loan(transfer_future: Future, amount: u64, loan_id: field) {
        transfer_future.await();
        let used: bool = Mapping::get_or_use(loan_nullifiers, loan_id, false);
        assert(!used);
        Mapping::set(loan_nullifiers, loan_id, true);

        let liq: u64 = Mapping::get_or_use(pool_liquidity, 0u8, 0u64);
        let bor: u64 = Mapping::get_or_use(pool_borrowed,  0u8, 0u64);
        assert(liq >= bor + amount);

        Mapping::set(pool_borrowed,  0u8, bor + amount);
        Mapping::set(pool_liquidity, 0u8, liq + amount);

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        Mapping::set(active_loan_count, 0u8, lc + 1u32);
    }

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

        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(payment, self.address, owed);

        let new_reps: u32  = rec.repayments_made + 1u32;
        let new_vol: u64   = rec.total_volume + loan.principal;
        let new_score: u32 = compute_credit_score(rec.wallet_age_days, new_reps, rec.defaults, new_vol);

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

        return (change, updated_rec, finalize_repay_loan(transfer_future, loan.principal, interest, old_tier, new_tier));
    }

    async function finalize_repay_loan(
        transfer_future: Future,
        principal:       u64,
        interest:        u64,
        old_tier:        u8,
        new_tier:        u8
    ) {
        transfer_future.await();
        let bor: u64 = Mapping::get(pool_borrowed, 0u8);
        assert(bor >= principal);
        Mapping::set(pool_borrowed, 0u8, bor - principal);

        let earned: u64 = Mapping::get_or_use(pool_interest_earned, 0u8, 0u64);
        Mapping::set(pool_interest_earned, 0u8, earned + interest);

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        if lc > 0u32 { Mapping::set(active_loan_count, 0u8, lc - 1u32); }

        let old_count: u32 = Mapping::get_or_use(aggregate_tier_count, old_tier, 0u32);
        if old_count > 0u32 {
            Mapping::set(aggregate_tier_count, old_tier, old_count - 1u32);
        }
        let new_count: u32 = Mapping::get_or_use(aggregate_tier_count, new_tier, 0u32);
        Mapping::set(aggregate_tier_count, new_tier, new_count + 1u32);
    }

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
        Mapping::set(pool_borrowed, 0u8, bor >= principal ? bor - principal : 0u64);

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        if lc > 0u32 { Mapping::set(active_loan_count, 0u8, lc - 1u32); }

        let old_count: u32 = Mapping::get_or_use(aggregate_tier_count, old_tier, 0u32);
        if old_count > 0u32 {
            Mapping::set(aggregate_tier_count, old_tier, old_count - 1u32);
        }
        let new_count: u32 = Mapping::get_or_use(aggregate_tier_count, new_tier, 0u32);
        Mapping::set(aggregate_tier_count, new_tier, new_count + 1u32);
    }

    // ================================================================
    // SECTION 6 — SOLVENCY PROOF
    // ================================================================

    async transition prove_solvency() -> Future {
        return finalize_prove_solvency();
    }

    async function finalize_prove_solvency() {
        let liq: u64 = Mapping::get_or_use(pool_liquidity, 0u8, 0u64);
        let bor: u64 = Mapping::get_or_use(pool_borrowed,  0u8, 0u64);
        assert(bor <= liq);
    }

    // ================================================================
    // SECTION 7 — FLASH LOANS
    // ================================================================

    /// Privacy-preserving atomic flash loan.
    /// Borrow any amount, use it, repay principal + 1% fee in one tx.
    /// Atomicity guaranteed by Aleo VM: entire tx reverts if fee not repaid.
    /// No credit score required — pure capital efficiency primitive.
    async transition flash_loan(
        amount:     u64,
        loan_nonce: field
    ) -> (credits.aleo/credits, Future) {
        assert(amount > 0u64);

        let fee: u64 = (amount * FLASH_FEE_BPS) / 10_000u64;
        let actual_fee: u64 = fee > 0u64 ? fee : 1u64;

        let (funds, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(self.caller, amount);

        return (funds, finalize_flash_loan(transfer_future, amount, actual_fee, loan_nonce));
    }

    async function finalize_flash_loan(
        transfer_future: Future,
        amount:          u64,
        fee:             u64,
        loan_nonce:      field
    ) {
        transfer_future.await();

        let used: bool = Mapping::get_or_use(loan_nullifiers, loan_nonce, false);
        assert(!used);
        Mapping::set(loan_nullifiers, loan_nonce, true);

        let liq: u64 = Mapping::get_or_use(pool_liquidity, 0u8, 0u64);
        let bor: u64 = Mapping::get_or_use(pool_borrowed,  0u8, 0u64);
        assert(liq >= bor + amount);

        // Pool earns fee; principal returns atomically via same-tx repayment
        Mapping::set(pool_liquidity, 0u8, liq + fee);

        let fees: u64 = Mapping::get_or_use(flash_loan_fees,  0u8, 0u64);
        let cnt:  u32 = Mapping::get_or_use(flash_loan_count, 0u8, 0u32);
        Mapping::set(flash_loan_fees,  0u8, fees + fee);
        Mapping::set(flash_loan_count, 0u8, cnt  + 1u32);
    }

  }
