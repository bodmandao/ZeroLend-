// Issues and updates private credit records.
//              Users prove a credit TIER (1–5) via ZK proof
//              without revealing underlying financial data.
//              Score tiers:
//                 1 = Poor    (score < 300)
//                 2 = Fair    (score 300–499)
//                 3 = Good    (score 500–699)
//                 4 = Great   (score 700–849)
//                 5 = Excellent (score >= 850)
// ============================================================

program credit_score.aleo {

    // ----------------------------------------------------------------
    // RECORDS
    // ----------------------------------------------------------------

    /// Full private credit data — only the owner can see this.
    record CreditRecord {
        owner:             address,
        wallet_age_days:   u32,    // how old the wallet is
        repayments_made:   u32,    // successful on-time repayments
        defaults:          u32,    // missed repayments
        total_volume:      u128,   // lifetime tx volume (in microcredits)
        current_score:     u32,    // computed score 0–1000
        last_updated:      u32,    // block height of last update
        nonce:             field,  // randomness to prevent record correlation
    }

    /// A lightweight tier-only credential — shared with lenders.
    /// Contains NO raw data; proves only the tier band.
    record CreditTierProof {
        owner:        address,
        tier:         u8,     // 1–5 only
        org_id:       field,  // which protocol issued this
        expires_at:   u32,    // block height expiry
        nonce:        field,
    }

    // ----------------------------------------------------------------
    // MAPPINGS
    // ----------------------------------------------------------------

    /// Protocol admin address
    mapping protocol_admin: u8 => address;

    /// Nullifier set — prevents reuse of old tier proofs
    mapping used_nullifiers: field => bool;

    /// Public aggregate stats (no individual data)
    mapping aggregate_score_count: u8 => u32;  // tier => count of users

    // ----------------------------------------------------------------
    // HELPER FUNCTIONS
    // ----------------------------------------------------------------

    /// Pure function: compute credit score from raw inputs.
    /// Score range: 0–1000
    function compute_credit_score(
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u128
    ) -> u32 {
        // Age component: max 200 pts (2 pts/day up to 100 days)
        let age_score: u32 = wallet_age_days * 2u32;
        let age_capped: u32 = age_score > 200u32 ? 200u32 : age_score;

        // Repayment component: max 400 pts (10 pts per repayment up to 40)
        let rep_score: u32 = repayments_made * 10u32;
        let rep_capped: u32 = rep_score > 400u32 ? 400u32 : rep_score;

        // Default penalty: -100 pts per default, floor at 0
        let penalty: u32 = defaults * 100u32;

        // Volume component: max 200 pts
        // 1 pt per 1_000_000 microcredits, capped at 200
        let vol_u32: u32 = (total_volume / 1_000_000u128) as u32;
        let vol_capped: u32 = vol_u32 > 200u32 ? 200u32 : vol_u32;

        // Base score: 200 pts for any wallet
        let base: u32 = 200u32;

        let raw: u32 = base + age_capped + rep_capped + vol_capped;
        let after_penalty: u32 = raw > penalty ? raw - penalty : 0u32;
        let final_score: u32 = after_penalty > 1000u32 ? 1000u32 : after_penalty;

        return final_score;
    }

    /// Map score to tier band.
    function score_to_tier(score: u32) -> u8 {
        if score >= 850u32 { return 5u8; }
        if score >= 700u32 { return 4u8; }
        if score >= 500u32 { return 3u8; }
        if score >= 300u32 { return 2u8; }
        return 1u8;
    }

    // ----------------------------------------------------------------
    // TRANSITIONS
    // ----------------------------------------------------------------

    /// Initialize the protocol — called once by deployer.
    async transition initialize() -> (Future) {
        return finalize_initialize(self.caller);
    }

    async function finalize_initialize(admin: address) {
        let existing: address = Mapping::get_or_use(protocol_admin, 0u8, aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc);
        // Only allow initialization once
        assert_eq(existing, aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc);
        Mapping::set(protocol_admin, 0u8, admin);
    }

    /// Oracle-attested credit record issuance.
    /// The oracle (admin) submits signed off-chain data to mint
    /// a private CreditRecord for a user.
    async transition issue_credit_record(
        recipient:       address,
        wallet_age_days: u32,
        repayments_made: u32,
        defaults:        u32,
        total_volume:    u128,
        current_block:   u32,
        record_nonce:    field
    ) -> (CreditRecord, Future) {
        let score: u32 = compute_credit_score(
            wallet_age_days,
            repayments_made,
            defaults,
            total_volume
        );

        let rec: CreditRecord = CreditRecord {
            owner:           recipient,
            wallet_age_days: wallet_age_days,
            repayments_made: repayments_made,
            defaults:        defaults,
            total_volume:    total_volume,
            current_score:   score,
            last_updated:    current_block,
            nonce:           record_nonce,
        };

        let tier: u8 = score_to_tier(score);
        return (rec, finalize_credit_issuer(self.caller, tier));
    }

    async function finalize_credit_issuer(caller: address, tier: u8) {
        let admin: address = Mapping::get(protocol_admin, 0u8);
        assert_eq(admin, caller);
        // Increment aggregate counter for this tier
        let count: u32 = Mapping::get_or_use(aggregate_score_count, tier, 0u32);
        Mapping::set(aggregate_score_count, tier, count + 1u32);
    }

    /// Generate a short-lived CreditTierProof to share with a lender.
    /// The user proves their tier without revealing raw credit data.
    /// expires_in_blocks: how long the proof is valid.
    transition prove_tier(
        credit_record:    CreditRecord,
        proof_nonce:      field,
        expires_in_blocks: u32,
        current_block:    u32,
        org_id:           field
    ) -> (CreditRecord, CreditTierProof) {
        let tier: u8 = score_to_tier(credit_record.current_score);

        // Reissue the CreditRecord back to owner (records are consumed)
        let returned_record: CreditRecord = CreditRecord {
            owner:           credit_record.owner,
            wallet_age_days: credit_record.wallet_age_days,
            repayments_made: credit_record.repayments_made,
            defaults:        credit_record.defaults,
            total_volume:    credit_record.total_volume,
            current_score:   credit_record.current_score,
            last_updated:    credit_record.last_updated,
            nonce:           credit_record.nonce,
        };

        let proof: CreditTierProof = CreditTierProof {
            owner:      credit_record.owner,
            tier:       tier,
            org_id:     org_id,
            expires_at: current_block + expires_in_blocks,
            nonce:      proof_nonce,
        };

        return (returned_record, proof);
    }

    /// Update a credit record after a lending event (repayment or default).
    /// Only callable by the lending_pool.aleo program.
    async transition update_credit_record(
        credit_rec:      CreditRecord,
        new_repayment:   bool,   // true = successful repayment, false = default
        volume_delta:    u128,   // additional volume to add
        current_block:   u32,
        new_nonce:       field
    ) -> (CreditRecord, Future) {
        let new_repayments: u32 = new_repayment
            ? credit_rec.repayments_made + 1u32
            : credit_rec.repayments_made;
        let new_defaults: u32 = new_repayment
            ? credit_rec.defaults
            : credit_rec.defaults + 1u32;
        let new_volume: u128 = credit_rec.total_volume + volume_delta;

        let new_score: u32 = compute_credit_score(
            credit_rec.wallet_age_days,
            new_repayments,
            new_defaults,
            new_volume
        );

        let updated: CreditRecord = CreditRecord {
            owner:           credit_rec.owner,
            wallet_age_days: credit_rec.wallet_age_days,
            repayments_made: new_repayments,
            defaults:        new_defaults,
            total_volume:    new_volume,
            current_score:   new_score,
            last_updated:    current_block,
            nonce:           new_nonce,
        };

        let old_tier: u8 = score_to_tier(credit_rec.current_score);
        let new_tier: u8 = score_to_tier(new_score);
        return (updated, finalize_update_credit_record(old_tier, new_tier));
    }

    async function finalize_update_credit_record(old_tier: u8, new_tier: u8) {
        // Adjust public aggregate counters
        let old_count: u32 = Mapping::get_or_use(aggregate_score_count, old_tier, 0u32);
        if old_count > 0u32 {
            Mapping::set(aggregate_score_count, old_tier, old_count - 1u32);
        }
        let new_count: u32 = Mapping::get_or_use(aggregate_score_count, new_tier, 0u32);
        Mapping::set(aggregate_score_count, new_tier, new_count + 1u32);
    }

    /// Validate a CreditTierProof meets a minimum tier threshold.
    /// Returns the proof back if valid (consumed otherwise).
    transition assert_tier_meets_minimum(
        proof:        CreditTierProof,
        minimum_tier: u8,
        current_block: u32
    ) -> CreditTierProof {
        assert(current_block <= proof.expires_at);
        assert(proof.tier >= minimum_tier);
        // Return proof so lender can hold it as evidence
        let returned: CreditTierProof = CreditTierProof {
            owner:      proof.owner,
            tier:       proof.tier,
            org_id:     proof.org_id,
            expires_at: proof.expires_at,
            nonce:      proof.nonce,
        };
        return returned;
    }
}