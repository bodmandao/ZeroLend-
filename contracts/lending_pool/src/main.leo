program zerolend_lending_pool.aleo {

    /// Private fungible token (USDC or any asset)
    record Token {
        owner:    address,
        token_id: field,
        amount:   u128,
    }

    /// Full private credit data — only owner can see
    record CreditRecord {
        owner:             address,
        wallet_age_days:   u32,
        repayments_made:   u32,
        defaults:          u32,
        total_volume:      u128,
        current_score:     u32,
        last_updated:      u32,
        nonce:             field,
    }

    /// Lightweight tier credential shared with lenders
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
        token_id:       field,
        principal:      u128,
        interest_rate:  u64,
        borrowed_block: u32,
        due_block:      u32,
        tier_at_borrow: u8,
        nonce:          field,
    }

    /// Private deposit receipt held by lender
    record LenderDeposit {
        owner:            address,
        token_id:         field,
        deposited_amount: u128,
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
        total_volume:    u128,
        valid_until:     u32,
        attestation_id:  field,
    }

    // ================================================================
    // CONSTANTS
    // ================================================================

    const USDC_TOKEN_ID: field = 1field;

    // Interest rates per tier (basis points per 1000 blocks)
    const RATE_TIER_1: u64 = 2000u64; // 20% — Poor
    const RATE_TIER_2: u64 = 1500u64; // 15% — Fair
    const RATE_TIER_3: u64 = 1000u64; // 10% — Good
    const RATE_TIER_4: u64 =  700u64; //  7% — Great
    const RATE_TIER_5: u64 =  400u64; //  4% — Excellent

    // Max loan per tier (in micro-USDC, 6 decimals)
    const MAX_LOAN_TIER_1: u128 =        100_000_000u128; //      100 USDC
    const MAX_LOAN_TIER_2: u128 =        500_000_000u128; //      500 USDC
    const MAX_LOAN_TIER_3: u128 =      2_000_000_000u128; //    2,000 USDC
    const MAX_LOAN_TIER_4: u128 =     10_000_000_000u128; //   10,000 USDC
    const MAX_LOAN_TIER_5: u128 =     50_000_000_000u128; //   50,000 USDC

    // Grace period before liquidation (~1 day at 10s/block)
    const GRACE_PERIOD: u32 = 8640u32;

    // ================================================================
    // MAPPINGS — public on-chain state
    // ================================================================

    mapping protocol_admin:    u8      => address;
    mapping approved_oracles:  address => bool;

    // Token supply
    mapping total_supply:      field   => u128;

    // Pool state
    mapping pool_liquidity:    field   => u128;
    mapping pool_borrowed:     field   => u128;
    mapping pool_interest_earned: field => u128;
    mapping active_loan_count: u8      => u32;

    // Loan term in blocks per tier
    mapping loan_term_blocks:  u8      => u32;

    // Nullifier sets
    mapping loan_nullifiers:       field => bool;
    mapping used_attestations:     field => bool;

    // Public aggregate credit stats (no individual data exposed)
    mapping aggregate_tier_count:  u8    => u32;

    // constructor
        @noupgrade
    async constructor(
    ) {}

    // ================================================================
    // HELPER FUNCTIONS 
    // ================================================================

    /// Compute credit score 0–1000 from raw inputs
    function compute_credit_score(
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u128
    ) -> u32 {
        // Age: max 200 pts
        let age_pts: u32   = wallet_age_days * 2u32;
        let age_cap: u32   = age_pts > 200u32 ? 200u32 : age_pts;

        // Repayments: max 400 pts
        let rep_pts: u32   = repayments_made * 10u32;
        let rep_cap: u32   = rep_pts > 400u32 ? 400u32 : rep_pts;

        // Volume: max 200 pts (1 pt per 1M micro-USDC)
        let vol_u32: u32   = (total_volume / 1_000_000u128) as u32;
        let vol_cap: u32   = vol_u32 > 200u32 ? 200u32 : vol_u32;

        // Base: 200 pts for any wallet
        let raw: u32       = 200u32 + age_cap + rep_cap + vol_cap;

        // Default penalty: -100 pts each
        let penalty: u32   = defaults * 100u32;
        let after: u32     = raw > penalty ? raw - penalty : 0u32;

        return after > 1000u32 ? 1000u32 : after;
    }

    /// Map score to tier band 1–5
    function score_to_tier(score: u32) -> u8 {
        if score >= 850u32 { return 5u8; }
        if score >= 700u32 { return 4u8; }
        if score >= 500u32 { return 3u8; }
        if score >= 300u32 { return 2u8; }
        return 1u8;
    }

    /// Interest = principal * rate_bps * blocks / 10_000_000
    function compute_interest(
        principal:   u128,
        rate_bps:    u64,
        blocks_held: u32
    ) -> u128 {
        let rate:   u128 = rate_bps as u128;
        let blocks: u128 = blocks_held as u128;
        return (principal * rate * blocks) / 10_000_000u128;
    }

    /// Get rate for tier
    function rate_for_tier(tier: u8) -> u64 {
        if tier == 5u8 { return RATE_TIER_5; }
        if tier == 4u8 { return RATE_TIER_4; }
        if tier == 3u8 { return RATE_TIER_3; }
        if tier == 2u8 { return RATE_TIER_2; }
        return RATE_TIER_1;
    }

    /// Get max loan for tier
    function max_loan_for_tier(tier: u8) -> u128 {
        if tier == 5u8 { return MAX_LOAN_TIER_5; }
        if tier == 4u8 { return MAX_LOAN_TIER_4; }
        if tier == 3u8 { return MAX_LOAN_TIER_3; }
        if tier == 2u8 { return MAX_LOAN_TIER_2; }
        return MAX_LOAN_TIER_1;
    }

    // ================================================================
    // PROTOCOL SETUP
    // ================================================================

    /// Deploy protocol. Caller becomes admin and first oracle.
    async transition initialize(initial_supply: u128) -> (Token,Future) {
        let genesis: Token = Token {
            owner:    self.caller as address,
            token_id: USDC_TOKEN_ID,
            amount:   initial_supply,
        };
        return (genesis, finalize_initialize(self.caller, initial_supply));
    }

    async function finalize_initialize(admin: address, supply: u128) {
        // Only allow once
        let existing: u128 = Mapping::get_or_use(total_supply, USDC_TOKEN_ID, 0u128);
        assert_eq(existing, 0u128);

        Mapping::set(protocol_admin,   0u8, admin);
        Mapping::set(approved_oracles, admin, true);
        Mapping::set(total_supply,     USDC_TOKEN_ID, supply);
        Mapping::set(pool_liquidity,   USDC_TOKEN_ID, 0u128);
        Mapping::set(pool_borrowed,    USDC_TOKEN_ID, 0u128);
        Mapping::set(pool_interest_earned, USDC_TOKEN_ID, 0u128);
        Mapping::set(active_loan_count, 0u8, 0u32);

        // Loan terms per tier (in blocks)
        Mapping::set(loan_term_blocks, 1u8,  17280u32); // ~2 days
        Mapping::set(loan_term_blocks, 2u8,  43200u32); // ~5 days
        Mapping::set(loan_term_blocks, 3u8,  86400u32); // ~10 days
        Mapping::set(loan_term_blocks, 4u8, 172800u32); // ~20 days
        Mapping::set(loan_term_blocks, 5u8, 259200u32); // ~30 days
    }

    // ================================================================
    // TOKEN OPERATIONS
    // ================================================================

    /// Mint tokens — admin only
    async transition mint(receiver: address, amount: u128) -> (Token,Future) {
        let t: Token = Token {
            owner:    receiver,
            token_id: USDC_TOKEN_ID,
            amount:   amount,
        };
        return (t, finalize_mint(self.caller, amount));
    }

    async function finalize_mint(caller: address, amount: u128) {
        let admin: address = Mapping::get(protocol_admin, 0u8);
        assert_eq(admin, caller);
        let s: u128 = Mapping::get_or_use(total_supply, USDC_TOKEN_ID, 0u128);
        Mapping::set(total_supply, USDC_TOKEN_ID, s + amount);
    }

    /// Private transfer — amounts hidden from public
    transition transfer(
        sender_token: Token,
        receiver:     address,
        amount:       u128
    ) -> (Token, Token) {
        assert(sender_token.amount >= amount);

        let change: Token = Token {
            owner:    sender_token.owner,
            token_id: sender_token.token_id,
            amount:   sender_token.amount - amount,
        };
        let recv: Token = Token {
            owner:    receiver,
            token_id: sender_token.token_id,
            amount:   amount,
        };
        return (change, recv);
    }

    /// Combine two Token records into one
    transition combine(a: Token, b: Token) -> Token {
        assert_eq(a.token_id, b.token_id);
        assert_eq(a.owner,    b.owner);
        return Token {
            owner:    a.owner,
            token_id: a.token_id,
            amount:   a.amount + b.amount,
        };
    }

    /// Split one Token into two
    transition split(tok: Token, amount: u128) -> (Token, Token) {
        assert(tok.amount >= amount);
        let a: Token = Token { owner: tok.owner, token_id: tok.token_id, amount: amount };
        let b: Token = Token { owner: tok.owner, token_id: tok.token_id, amount: tok.amount - amount };
        return (a, b);
    }

    // ================================================================
    // ORACLE / CREDIT ATTESTATION
    // ================================================================

    /// Admin adds an approved oracle
    async transition add_oracle(oracle: address) -> (Future) {
        return (finalize_add_oracle(self.caller, oracle));
    }

    async function finalize_add_oracle(caller: address, oracle: address) {
        let admin: address = Mapping::get(protocol_admin, 0u8);
        assert_eq(admin, caller);
        Mapping::set(approved_oracles, oracle, true);
    }

    /// Admin removes an oracle
    async transition remove_oracle(oracle: address) -> (Future) {
        return (finalize_remove_oracle(self.caller, oracle));
    }

    async function finalize_remove_oracle(caller: address, oracle: address) {
        let admin: address = Mapping::get(protocol_admin, 0u8);
        assert_eq(admin, caller);
        Mapping::set(approved_oracles, oracle, false);
    }

    /// Oracle submits off-chain credit data for a user.
    async transition attest_credit(
        recipient:       address,
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u128,
        valid_for_blocks: u32,
        current_block:   u32,
        attestation_id:  field
    ) -> (OracleAttestation,Future) {
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

    // ================================================================
    // CREDIT RECORD MANAGEMENT
    // ================================================================

    /// User redeems an OracleAttestation to mint their private CreditRecord.
    /// Attestation is single-use and consumed here.
    async transition redeem_attestation(
        att:           OracleAttestation,
        current_block: u32,
        record_nonce:  field
    ) -> (CreditRecord,Future) {
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

    /// User generates a CreditTierProof to share with the lending pool.
    /// Raw credit data stays private — only tier is revealed.
    transition prove_tier(
        rec:              CreditRecord,
        proof_nonce:      field,
        expires_in:       u32,
        current_block:    u32,
        org_id:           field
    ) -> (CreditRecord, CreditTierProof) {
        let tier: u8 = score_to_tier(rec.current_score);

        // Re-issue record back to owner (records are consumed on use)
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
    //  LENDING POOL
    // ================================================================

    /// Lender deposits USDC into pool to earn yield
    async transition deposit(
        token:         Token,
        amount:        u128,
        current_block: u32,
        dep_nonce:     field
    ) -> (Token, LenderDeposit,Future) {
        assert_eq(token.token_id, USDC_TOKEN_ID);
        assert(token.amount >= amount);

        let change: Token = Token {
            owner:    token.owner,
            token_id: token.token_id,
            amount:   token.amount - amount,
        };

        let receipt: LenderDeposit = LenderDeposit {
            owner:            token.owner,
            token_id:         USDC_TOKEN_ID,
            deposited_amount: amount,
            deposit_block:    current_block,
            nonce:            dep_nonce,
        };

        return (change, receipt, finalize_deposit(amount));
    }

    async function finalize_deposit(amount: u128) {
        let liq: u128 = Mapping::get_or_use(pool_liquidity, USDC_TOKEN_ID, 0u128);
        Mapping::set(pool_liquidity, USDC_TOKEN_ID, liq + amount);
    }

    /// Lender withdraws principal + yield
    async transition withdraw(
        receipt:       LenderDeposit,
        current_block: u32
    ) -> (Token, Future) {
        let blocks: u32  = current_block - receipt.deposit_block;
        let yield_amt: u128 = compute_interest(receipt.deposited_amount, RATE_TIER_3, blocks);
        let total: u128  = receipt.deposited_amount + yield_amt;

        let payout: Token = Token {
            owner:    receipt.owner,
            token_id: USDC_TOKEN_ID,
            amount:   total,
        };

        return (payout, finalize_withdraw(receipt.deposited_amount, yield_amt));
    }

    async function finalize_withdraw(principal: u128, yield_paid: u128) {
        let liq: u128 = Mapping::get(pool_liquidity, USDC_TOKEN_ID);
        assert(liq >= principal + yield_paid);
        Mapping::set(pool_liquidity, USDC_TOKEN_ID, liq - principal - yield_paid);

        let earned: u128 = Mapping::get_or_use(pool_interest_earned, USDC_TOKEN_ID, 0u128);
        if earned >= yield_paid {
            Mapping::set(pool_interest_earned, USDC_TOKEN_ID, earned - yield_paid);
        }
    }

    // ================================================================
    //  LOAN LIFECYCLE
    // ================================================================

    /// Borrower requests a loan using their CreditTierProof.
    /// Proof is consumed and re-issued. Loan funds minted to borrower.
    async transition request_loan(
        proof:         CreditTierProof,
        amount:        u128,
        current_block: u32,
        loan_nonce:    field,
        loan_id:       field
    ) -> (CreditTierProof, LoanRecord, Token, Future) {
        // Proof must be valid and unexpired
        assert(current_block <= proof.expires_at);

        // Amount must not exceed tier limit
        let max_loan: u128 = max_loan_for_tier(proof.tier);
        assert(amount <= max_loan);
        assert(amount > 0u128);

        let rate: u64 = rate_for_tier(proof.tier);

        // Re-issue proof back to borrower
        let returned_proof: CreditTierProof = CreditTierProof {
            owner:      proof.owner,
            tier:       proof.tier,
            org_id:     proof.org_id,
            expires_at: proof.expires_at,
            nonce:      proof.nonce,
        };

        // Private loan record
        let loan: LoanRecord = LoanRecord {
            owner:          proof.owner,
            loan_id:        loan_id,
            token_id:       USDC_TOKEN_ID,
            principal:      amount,
            interest_rate:  rate,
            borrowed_block: current_block,
            due_block:      current_block + 86400u32, // default: ~10 days
            tier_at_borrow: proof.tier,
            nonce:          loan_nonce,
        };

        // Loan funds as private token record
        let funds: Token = Token {
            owner:    proof.owner,
            token_id: USDC_TOKEN_ID,
            amount:   amount,
        };

        return (returned_proof, loan, funds, finalize_request_loan(amount, loan_id, proof.tier));
    }

    async function finalize_request_loan(amount: u128, loan_id: field, tier: u8) {
        // Prevent loan_id reuse
        let used: bool = Mapping::get_or_use(loan_nullifiers, loan_id, false);
        assert(!used);
        Mapping::set(loan_nullifiers, loan_id, true);

        // Check available liquidity
        let liq: u128  = Mapping::get_or_use(pool_liquidity, USDC_TOKEN_ID, 0u128);
        let bor: u128  = Mapping::get_or_use(pool_borrowed,  USDC_TOKEN_ID, 0u128);
        assert(liq - bor >= amount);

        Mapping::set(pool_borrowed, USDC_TOKEN_ID, bor + amount);

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        Mapping::set(active_loan_count, 0u8, lc + 1u32);
    }

    /// Borrower repays their loan (principal + interest).
    /// Credit record is updated with successful repayment.
    async transition repay_loan(
        loan:          LoanRecord,
        payment:       Token,
        rec:           CreditRecord,
        current_block: u32,
        new_rec_nonce: field
    ) -> (Token, CreditRecord, Future) {
        assert_eq(loan.token_id,  payment.token_id);
        assert_eq(loan.owner,     rec.owner);
        assert_eq(loan.owner,     self.caller);

        let blocks: u32    = current_block - loan.borrowed_block;
        let interest: u128 = compute_interest(loan.principal, loan.interest_rate, blocks);
        let owed: u128     = loan.principal + interest;

        assert(payment.amount >= owed);

        // Change back to borrower
        let change: Token = Token {
            owner:    payment.owner,
            token_id: payment.token_id,
            amount:   payment.amount - owed,
        };

        // Update credit — repayment success
        let new_reps: u32   = rec.repayments_made + 1u32;
        let new_vol: u128   = rec.total_volume + loan.principal;
        let new_score: u32  = compute_credit_score(
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
        principal: u128,
        interest:  u128,
        old_tier:  u8,
        new_tier:  u8
    ) {
        let bor: u128 = Mapping::get(pool_borrowed, USDC_TOKEN_ID);
        assert(bor >= principal);
        Mapping::set(pool_borrowed, USDC_TOKEN_ID, bor - principal);

        let earned: u128 = Mapping::get_or_use(pool_interest_earned, USDC_TOKEN_ID, 0u128);
        Mapping::set(pool_interest_earned, USDC_TOKEN_ID, earned + interest);

        let lc: u32 = Mapping::get_or_use(active_loan_count, 0u8, 0u32);
        if lc > 0u32 { Mapping::set(active_loan_count, 0u8, lc - 1u32); }

        // Adjust public tier counters
        let old_count: u32 = Mapping::get_or_use(aggregate_tier_count, old_tier, 0u32);
        if old_count > 0u32 {
            Mapping::set(aggregate_tier_count, old_tier, old_count - 1u32);
        }
        let new_count: u32 = Mapping::get_or_use(aggregate_tier_count, new_tier, 0u32);
        Mapping::set(aggregate_tier_count, new_tier, new_count + 1u32);
    }

    /// Liquidate an overdue loan — callable by anyone after grace period.
    /// Borrower's credit record is penalized with a default.
    async transition liquidate(
        loan:          LoanRecord,
        rec:           CreditRecord,
        current_block: u32,
        new_rec_nonce: field
    ) -> (  CreditRecord, Future) {
        assert_eq(loan.owner, rec.owner);
        // Must be past due date + grace period
        assert(current_block > loan.due_block + GRACE_PERIOD);

        let new_defaults: u32  = rec.defaults + 1u32;
        let new_score: u32     = compute_credit_score(
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

    async function finalize_liquidate(principal: u128, old_tier: u8, new_tier: u8) {
        let bor: u128 = Mapping::get_or_use(pool_borrowed, USDC_TOKEN_ID, 0u128);
        Mapping::set(
            pool_borrowed,
            USDC_TOKEN_ID,
            bor >= principal ? bor - principal : 0u128
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

    // ================================================================
    // SOLVENCY PROOF 
    // ================================================================

    /// Anyone can call this to publicly prove the pool is solvent.
    async transition prove_solvency() -> (Future) {
        return (finalizeprove_solvency());
    }

    async function finalizeprove_solvency() {
        let liq: u128 = Mapping::get_or_use(pool_liquidity, USDC_TOKEN_ID, 0u128);
        let bor: u128 = Mapping::get_or_use(pool_borrowed,  USDC_TOKEN_ID, 0u128);
        // This assertion is the on-chain solvency proof.
        // If this passes, the pool is solvent. Individual positions remain private.
        assert(bor <= liq);
    }
}
